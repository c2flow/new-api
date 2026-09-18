package controller

import (
	"bytes"
	"fmt"
	"net/http/httptest"
	"os"
	"strconv"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/authz"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// External DSNs must name disposable databases created only for this test.
func TestOrganizationPublicAPIBoundary(t *testing.T) {
	previousMaster := common.IsMasterNode
	common.IsMasterNode = true
	t.Cleanup(func() { common.IsMasterNode = previousMaster })
	var dialector gorm.Dialector = sqlite.Open(t.TempDir() + "/boundary.db")
	dialect := common.DatabaseTypeSQLite
	if dsn := os.Getenv("ORGANIZATION_API_TEST_MYSQL_DSN"); dsn != "" {
		dialector, dialect = mysql.Open(dsn), common.DatabaseTypeMySQL
	}
	if dsn := os.Getenv("ORGANIZATION_API_TEST_POSTGRES_DSN"); dsn != "" {
		dialector, dialect = postgres.New(postgres.Config{DSN: dsn, PreferSimpleProtocol: true}), common.DatabaseTypePostgreSQL
	}
	db, err := gorm.Open(dialector, &gorm.Config{})
	require.NoError(t, err)
	oldDB, oldLog, oldRedis := model.DB, model.LOG_DB, common.RedisEnabled
	oldDialect, oldLogDialect := common.MainDatabaseType(), common.LogDatabaseType()
	model.DB, model.LOG_DB, common.RedisEnabled = db, db, false
	common.SetMainDatabaseType(dialect)
	common.SetLogDatabaseType(dialect)
	t.Cleanup(func() {
		model.DB, model.LOG_DB, common.RedisEnabled = oldDB, oldLog, oldRedis
		common.SetMainDatabaseType(oldDialect)
		common.SetLogDatabaseType(oldLogDialect)
		sqlDB, err := db.DB()
		require.NoError(t, err)
		require.NoError(t, sqlDB.Close())
	})
	resources := []any{&model.User{}, &model.Organization{}, &model.OrganizationMember{}, &model.OrganizationAudit{}, &model.OrganizationTransfer{}, &model.OrganizationCharge{}, &model.Token{}, &model.Log{}, &model.TopUp{}, &model.UserSubscription{}, &model.SubscriptionOrder{}, &model.CasbinRule{}, &model.AuthzRole{}}
	for _, resource := range resources {
		require.NoError(t, db.Migrator().DropTable(resource))
	}
	require.NoError(t, db.AutoMigrate(resources...))
	require.NoError(t, authz.Init(db))
	var version string
	versionQuery := "SELECT version()"
	if dialect == common.DatabaseTypeSQLite {
		versionQuery = "SELECT sqlite_version()"
	}
	require.NoError(t, db.Raw(versionQuery).Scan(&version).Error)
	t.Logf("database: %s", version)
	owner := model.User{Username: "owner", DisplayName: "Owner Name", Password: "private-password", Email: "private@example.test", AffCode: "owner", Status: 1, Quota: 12345}
	require.NoError(t, db.Create(&owner).Error)
	team, err := model.CreateTeamOrganization(owner.Id, "Design team")
	require.NoError(t, err)
	key := model.Token{UserId: owner.Id, Name: "personal-key", Key: "private-token-key"}
	require.NoError(t, db.Create(&key).Error)
	r := gin.New()
	r.Use(func(c *gin.Context) { c.Set("id", owner.Id); c.Set("role", common.RoleRootUser); c.Next() })
	r.GET("/organizations", ListOrganizations)
	r.GET("/platform/organizations", PlatformListOrganizations)
	r.GET("/platform/organizations/:org_id/resources/:resource", PlatformOrganizationResources)
	r.PUT("/platform/organizations/:org_id/status", PlatformChangeOrganizationStatus)
	r.GET("/organizations/:org_id/deletion-impact", GetOrganizationDeletionImpact)
	r.PUT("/organizations/:org_id/status", ChangeOrganizationStatus)
	account := r.Group("/account", middleware.OrganizationContext())
	account.GET("/summary", GetAccountSummary)
	account.GET("/tokens", middleware.RequireSelectedOrgPermission("org.token", "write"), GetAllTokens)
	org := r.Group("/org", middleware.OrganizationContext(), middleware.RequireOrganization())
	org.GET("/context", GetOrganizationContext)
	org.GET("/members", GetOrganizationMembers)
	org.GET("/summary", GetOrganizationSummary)
	org.PUT("/members/limits", middleware.RequireOrgPermission("org.member", "write"), SetOrganizationMemberLimits)
	org.PUT("/members/:user_id", middleware.RequireOrgPermission("org.member", "write"), UpdateOrganizationMember)

	request := func(method, path, header, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
		if header != "" {
			req.Header.Set("X-Org-Id", header)
		}
		result := httptest.NewRecorder()
		r.ServeHTTP(result, req)
		return result
	}
	t.Run("platform pagination search and owners expose only teams", func(t *testing.T) {
		require.NoError(t, model.DB.Model(team).Update("remark", "private-customer-987").Error)
		for _, path := range []string{"/platform/organizations?size=1", "/platform/organizations?keyword=Design", "/platform/organizations?keyword=customer-987", "/platform/organizations?keyword=987", fmt.Sprintf("/platform/organizations?keyword=%d", team.Id)} {
			result := request("GET", path, "", "")
			require.Equal(t, 200, result.Code)
			var body struct {
				Data struct {
					Total int
					Items []struct {
						ID               int
						OwnerUsername    string `json:"owner_username"`
						OwnerDisplayName string `json:"owner_display_name"`
					}
				}
			}
			require.NoError(t, common.Unmarshal(result.Body.Bytes(), &body))
			require.Equal(t, 1, body.Data.Total)
			require.Len(t, body.Data.Items, 1)
			assert.Equal(t, team.Id, body.Data.Items[0].ID)
			assert.Equal(t, "owner", body.Data.Items[0].OwnerUsername)
			assert.Equal(t, "Owner Name", body.Data.Items[0].OwnerDisplayName)
			assert.Contains(t, result.Body.String(), `"remark":"private-customer-987"`)
			assert.NotContains(t, result.Body.String(), `"slug"`)
			assert.NotContains(t, result.Body.String(), "private-password")
			assert.NotContains(t, result.Body.String(), "private@example.test")
		}
		result := request("GET", "/platform/organizations?keyword=personal-", "", "")
		assert.Contains(t, result.Body.String(), `"total":0`)
		assert.Contains(t, result.Body.String(), `"items":[]`)
		result = request("GET", "/organizations", "", "")
		assert.Contains(t, result.Body.String(), "Design team")
		assert.NotContains(t, result.Body.String(), "private-customer-987")
		assert.NotContains(t, result.Body.String(), `"remark"`)
		assert.NotContains(t, result.Body.String(), "personal-")
		assert.NotContains(t, result.Body.String(), `"kind":"personal"`)
	})

	t.Run("monthly usage is available independently of limits", func(t *testing.T) {
		path := fmt.Sprint(team.Id)
		result := request("GET", "/org/members", path, "")
		require.Equal(t, 200, result.Code)
		assert.Contains(t, result.Body.String(), "monthly_usage")
		result = request("PUT", "/org/members/limits", path, fmt.Sprintf(`{"user_ids":[%d],"monthly_spend_limit":100}`, owner.Id))
		require.Equal(t, 200, result.Code, result.Body.String())
		result = request("GET", "/org/members", path, "")
		require.Equal(t, 200, result.Code, result.Body.String())
		assert.Contains(t, result.Body.String(), `"monthly_spend_limit":100`)
		assert.Contains(t, result.Body.String(), `"monthly_usage"`)
		unlimited := model.User{Username: "unlimited-usage", AffCode: "unlimited-usage", Status: 1}
		require.NoError(t, db.Create(&unlimited).Error)
		membership := model.OrganizationMember{OrgId: team.Id, UserId: unlimited.Id, Role: model.OrgRoleMember, Status: model.OrganizationActive}
		require.NoError(t, db.Create(&membership).Error)
		monthlyCharge := model.OrganizationCharge{OrgId: team.Id, UserId: unlimited.Id, RequestId: "unlimited-monthly-usage", Quota: 17, Status: "settled", CreatedAt: common.GetTimestamp()}
		require.NoError(t, db.Create(&monthlyCharge).Error)
		result = request("PUT", "/org/members/limits", path, fmt.Sprintf(`{"user_ids":[%d],"monthly_spend_limit":0}`, owner.Id))
		require.Equal(t, 200, result.Code)
		result = request("GET", "/org/members", path, "")
		var response struct {
			Data []struct {
				UserID       int                            `json:"user_id"`
				MonthlyUsage *model.OrganizationBudgetUsage `json:"monthly_usage"`
			} `json:"data"`
		}
		require.NoError(t, common.Unmarshal(result.Body.Bytes(), &response))
		found := false
		for _, member := range response.Data {
			if member.UserID == unlimited.Id {
				found = true
				require.NotNil(t, member.MonthlyUsage)
				assert.Equal(t, int64(17), member.MonthlyUsage.Used)
			}
		}
		require.True(t, found)
		// Identity-only edits must preserve limits even if stale clients send them.
		result = request("PUT", "/org/members/limits", path, fmt.Sprintf(`{"user_ids":[%d],"spend_limit":200,"monthly_spend_limit":100}`, unlimited.Id))
		require.Equal(t, 200, result.Code)
		for _, extra := range []string{"", `,"spend_limit":0,"monthly_spend_limit":0`} {
			result = request("PUT", fmt.Sprintf("/org/members/%d", unlimited.Id), path, `{"role":"admin","status":1`+extra+`}`)
			require.Equal(t, 200, result.Code)
			require.NoError(t, db.First(&membership, membership.Id).Error)
			assert.Equal(t, model.OrgRoleAdmin, membership.Role)
			assert.Equal(t, int64(200), membership.SpendLimit)
			assert.Equal(t, int64(100), membership.MonthlySpendLimit)
		}
		result = request("PUT", "/org/members/limits", path, fmt.Sprintf(`{"user_ids":[%d],"monthly_spend_limit":100}`, owner.Id))
		require.Equal(t, 200, result.Code)
		require.NoError(t, db.Delete(&monthlyCharge).Error)
		require.NoError(t, db.Delete(&membership).Error)
		require.NoError(t, db.Unscoped().Delete(&unlimited).Error)
		require.NoError(t, db.Model(team).Update("quota", 1000).Error)
		charge := model.OrganizationCharge{OrgId: team.Id, UserId: owner.Id, RequestId: "monthly-summary", Quota: 40, Status: "reserved", CreatedAt: common.GetTimestamp()}
		require.NoError(t, db.Create(&charge).Error)
		monthStart, _ := model.OrganizationMonthlyWindow(common.GetTimestamp())
		historical := model.OrganizationCharge{OrgId: team.Id, UserId: owner.Id, RequestId: "previous-month-summary", PeriodStart: team.BudgetPeriodStart, Quota: 999, Status: "settled", CreatedAt: monthStart - 1}
		require.NoError(t, db.Create(&historical).Error)
		result = request("GET", "/org/summary", path, "")
		require.Equal(t, 200, result.Code, result.Body.String())
		assert.Contains(t, result.Body.String(), `"available_quota":60`)
		assert.Contains(t, result.Body.String(), `"reserved":40`)
		assert.NotContains(t, result.Body.String(), `"used":999`)
		require.NoError(t, db.Delete(&charge).Error)
		require.NoError(t, db.Delete(&historical).Error)
		require.NoError(t, db.Model(team).Update("quota", 0).Error)

		for _, body := range []string{`{}`, `{"user_ids":[],"monthly_spend_limit":0}`, fmt.Sprintf(`{"user_ids":[%d]}`, owner.Id)} {
			result = request("PUT", "/org/members/limits", path, body)
			assert.Equal(t, 400, result.Code)
		}
		result = request("PUT", "/org/members/limits", path, fmt.Sprintf(`{"user_ids":[%d],"monthly_spend_limit":0}`, owner.Id))
		require.Equal(t, 200, result.Code)
		result = request("GET", "/org/members", path, "")
		assert.Contains(t, result.Body.String(), "monthly_usage")
	})
	t.Run("member total limit includes historical periods and supports partial limit updates", func(t *testing.T) {
		path := fmt.Sprint(team.Id)
		result := request("PUT", "/org/members/limits", path, fmt.Sprintf(`{"user_ids":[%d],"spend_limit":100}`, owner.Id))
		require.Equal(t, 200, result.Code, result.Body.String())
		require.NoError(t, db.Model(team).Update("quota", 1000).Error)
		charge := model.OrganizationCharge{OrgId: team.Id, UserId: owner.Id, RequestId: "historic-total-summary", Quota: 40, Status: "settled", PeriodStart: 1, CreatedAt: 1}
		require.NoError(t, db.Create(&charge).Error)
		result = request("GET", "/org/summary", path, "")
		require.Equal(t, 200, result.Code)
		assert.Contains(t, result.Body.String(), `"available_quota":60`)
		result = request("GET", "/org/members", path, "")
		assert.Contains(t, result.Body.String(), `"used":40`)
		result = request("PUT", "/org/members/limits", path, fmt.Sprintf(`{"user_ids":[%d],"monthly_spend_limit":20}`, owner.Id))
		require.Equal(t, 200, result.Code)
		result = request("GET", "/org/members", path, "")
		assert.Contains(t, result.Body.String(), `"spend_limit":100`)
		assert.Contains(t, result.Body.String(), `"monthly_spend_limit":20`)
		result = request("PUT", "/org/members/limits", path, fmt.Sprintf(`{"user_ids":[%d]}`, owner.Id))
		assert.Equal(t, 400, result.Code)
		result = request("PUT", "/org/members/limits", path, fmt.Sprintf(`{"user_ids":[%d],"spend_limit":0,"monthly_spend_limit":0}`, owner.Id))
		require.Equal(t, 200, result.Code)
		require.NoError(t, db.Delete(&charge).Error)
		require.NoError(t, db.Model(team).Update("quota", 0).Error)
	})
	t.Run("personal account has no organization identity but retains wallet and keys", func(t *testing.T) {
		result := request("GET", "/account/context", "", "")
		require.Equal(t, 404, result.Code)
		result = request("GET", "/account/summary", "", "")
		require.Equal(t, 200, result.Code)
		assert.Contains(t, result.Body.String(), `"quota":12345`)
		assert.NotContains(t, result.Body.String(), "org_id")
		assert.NotContains(t, result.Body.String(), "member_count")
		result = request("GET", "/account/tokens", "", "")
		require.Equal(t, 200, result.Code)
		assert.Contains(t, result.Body.String(), "personal-key")
		assert.NotContains(t, result.Body.String(), "org_id")
		assert.NotContains(t, result.Body.String(), key.Key)
		var stored model.Token
		require.NoError(t, db.First(&stored, key.Id).Error)
		assert.Zero(t, stored.OrgId)
	})
	t.Run("unlimited personal subscription remains available without wallet overflow", func(t *testing.T) {
		sub := model.UserSubscription{UserId: owner.Id, Status: "active", EndTime: common.GetTimestamp() + 3600, AmountTotal: 0, AmountUsed: 50, AllowWalletOverflow: false}
		require.NoError(t, db.Create(&sub).Error)
		defer db.Delete(&sub)
		result := request("GET", "/account/summary", "", "")
		require.Equal(t, 200, result.Code)
		var body struct {
			Data struct {
				AvailableQuota int64 `json:"available_quota"`
			}
		}
		require.NoError(t, common.Unmarshal(result.Body.Bytes(), &body))
		assert.Equal(t, int64(common.MaxWalletQuota), body.Data.AvailableQuota)
	})
	t.Run("key search retains secret filtering and organization isolation", func(t *testing.T) {
		other := model.Token{UserId: owner.Id, Name: "other-key", Key: "other-secret"}
		teamKey := model.Token{OrgId: team.Id, UserId: owner.Id, Name: "team-key", Key: "team-secret"}
		require.NoError(t, db.Create(&other).Error)
		require.NoError(t, db.Create(&teamKey).Error)
		defer db.Delete(&other)
		defer db.Delete(&teamKey)
		for _, tc := range []struct {
			query, header string
			count         int
			name          string
		}{
			{"sk-private-token-key", "", 1, "personal-key"},
			{"missing", "", 0, ""},
			{"sk-team-secret", "", 0, ""},
			{"sk-team-secret", strconv.Itoa(team.Id), 1, "team-key"},
		} {
			result := request("GET", "/account/tokens?token="+tc.query, tc.header, "")
			var body struct {
				Success bool
				Data    struct {
					Total int
					Items []struct{ Name string }
				}
			}
			require.NoError(t, common.Unmarshal(result.Body.Bytes(), &body))
			require.True(t, body.Success, result.Body.String())
			assert.Equal(t, tc.count, body.Data.Total)
			require.Len(t, body.Data.Items, tc.count)
			if tc.count > 0 {
				assert.Equal(t, tc.name, body.Data.Items[0].Name)
			}
			assert.NotContains(t, result.Body.String(), "private-token-key")
			assert.NotContains(t, result.Body.String(), "team-secret")
		}
	})
	t.Run("organization endpoints require an existing team", func(t *testing.T) {
		id := strconv.Itoa(team.Id + 1000)
		for _, test := range []struct{ method, path, header, body string }{
			{"GET", "/org/context", "", ""}, {"GET", "/org/members", "", ""},
			{"GET", "/org/context", id, ""}, {"GET", "/account/tokens", id, ""},
			{"GET", "/platform/organizations/" + id + "/resources/members", "", ""},
			{"PUT", "/platform/organizations/" + id + "/status", "", `{"status":2,"reason":"test"}`},
			{"GET", "/organizations/" + id + "/deletion-impact", "", ""},
			{"PUT", "/organizations/" + id + "/status", "", `{"status":2}`},
		} {
			result := request(test.method, test.path, test.header, test.body)
			assert.Equal(t, 403, result.Code, test.method+test.path)
			assert.NotContains(t, result.Body.String(), "personal-")
		}
	})
	t.Run("teams still resolve and platform can disable and restore them", func(t *testing.T) {
		id := strconv.Itoa(team.Id)
		result := request("GET", "/org/context", id, "")
		require.Equal(t, 200, result.Code)
		assert.Contains(t, result.Body.String(), "Design team")
		assert.NotContains(t, result.Body.String(), "private-customer-987")
		assert.NotContains(t, result.Body.String(), `"remark"`)
		for _, status := range []string{"2", "1"} {
			result = request("PUT", "/platform/organizations/"+id+"/status", "", `{"status":`+status+`,"reason":"test"}`)
			assert.Equal(t, 200, result.Code)
			assert.Contains(t, result.Body.String(), `"success":true`)
		}
	})
}

func TestResourceResponsesKeepStorageScopePrivate(t *testing.T) {
	token := &model.Token{OrgId: 71, Key: "private", Name: "test"}
	for _, response := range []any{
		buildMaskedTokenResponse(token),
		[]*model.Log{{OrgId: 71, Quota: 12}},
		[]*model.TopUp{{OrgId: 71, Money: 2}},
		[]*model.Midjourney{{OrgId: 71}},
		[]*model.QuotaData{{OrgId: 71}},
		[]model.SubscriptionSummary{{Subscription: &model.UserSubscription{OrgId: 71}}},
	} {
		data, err := common.Marshal(response)
		require.NoError(t, err)
		assert.NotContains(t, string(data), "org_id")
	}
	data, err := common.Marshal(token)
	require.NoError(t, err)
	var cached model.Token
	require.NoError(t, common.Unmarshal(data, &cached))
	assert.Equal(t, 71, cached.OrgId, "cache serialization must retain the billing scope")
	assert.Equal(t, "private", cached.Key)
}
