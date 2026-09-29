package router

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/authz"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestPlatformOrganizationWriteAuthorization(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(t.TempDir()+"/quota.db"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Organization{}, &model.OrganizationMember{}, &model.OrganizationAudit{}, &model.Token{}, &model.TopUp{}, &model.QuotaData{}, &model.Log{}, &model.CasbinRule{}, &model.AuthzRole{}))
	previousDB, previousLogDB, previousRedis, previousMaster := model.DB, model.LOG_DB, common.RedisEnabled, common.IsMasterNode
	model.DB, model.LOG_DB, common.RedisEnabled, common.IsMasterNode = db, db, false, true
	t.Cleanup(func() {
		model.DB, model.LOG_DB, common.RedisEnabled, common.IsMasterNode = previousDB, previousLogDB, previousRedis, previousMaster
		sqlDB, err := db.DB()
		require.NoError(t, err)
		require.NoError(t, sqlDB.Close())
	})

	require.NoError(t, authz.Init(db))
	org := model.Organization{Id: 931, OwnerId: 922, Name: "Quota team", Status: model.OrganizationActive, Quota: 1000}
	require.NoError(t, db.Create(&org).Error)
	engine := gin.New()
	// Authorization is synchronous; avoid background platform audit writes outliving this fixture.
	engine.Use(func(c *gin.Context) { c.Set(string(constant.ContextKeyAuditLogged), true); c.Next() })
	setOrganizationRoutes(engine.Group("/api"))
	for _, test := range []struct {
		name   string
		role   int
		denied bool
		want   int
	}{{"root", 100, false, 200}, {"admin", 10, false, 200}, {"denied-admin", 10, true, 403}, {"owner", 1, false, 403}} {
		t.Run(test.name, func(t *testing.T) {
			token := "quota-" + test.name
			user := model.User{Username: test.name, AffCode: test.name, Role: test.role, Status: common.UserStatusEnabled, AccessToken: &token}
			require.NoError(t, db.Create(&user).Error)
			if test.name == "owner" {
				require.NoError(t, db.Model(&org).Update("owner_id", user.Id).Error)
			}
			if test.denied {
				require.NoError(t, authz.SetUserPermissions(user.Id, authz.PermissionsMap{"organization": {"write": false}}))
			}
			req := httptest.NewRequest(http.MethodPut, "/api/platform/organizations/931/quota", strings.NewReader(`{"mode":"add","value":100,"reason":"test adjustment"}`))
			req.Header.Set("Authorization", "Bearer "+token)
			req.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()
			engine.ServeHTTP(response, req)
			assert.Equal(t, test.want, response.Code, response.Body.String())
			req = httptest.NewRequest(http.MethodPut, "/api/platform/organizations/931/remark", strings.NewReader(`{"remark":"`+test.name+` customer"}`))
			req.Header.Set("Authorization", "Bearer "+token)
			req.Header.Set("Content-Type", "application/json")
			response = httptest.NewRecorder()
			engine.ServeHTTP(response, req)
			assert.Equal(t, test.want, response.Code, response.Body.String())
			req = httptest.NewRequest(http.MethodPut, "/api/platform/organizations/931/group", strings.NewReader(`{"group":"vip"}`))
			req.Header.Set("Authorization", "Bearer "+token)
			req.Header.Set("Content-Type", "application/json")
			response = httptest.NewRecorder()
			engine.ServeHTTP(response, req)
			assert.Equal(t, test.want, response.Code, response.Body.String())
		})
	}
	require.NoError(t, db.First(&org, org.Id).Error)
	assert.Equal(t, int64(1200), org.Quota)
	assert.Equal(t, "admin customer", org.Remark)
	assert.Equal(t, "vip", org.Group)
	for _, body := range []string{`{"mode":"override","reason":"missing value"}`, `{"mode":"add","value":1.2,"reason":"fractional"}`, `{"mode":"add","value":9223372036854775808,"reason":"overflow"}`} {
		req := httptest.NewRequest(http.MethodPut, "/api/platform/organizations/931/quota", strings.NewReader(body))
		req.Header.Set("Authorization", "Bearer quota-root")
		req.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		engine.ServeHTTP(response, req)
		assert.Equal(t, 400, response.Code, response.Body.String())
	}
}

func TestPlatformOrganizationRemarkRejectsMissingInput(t *testing.T) {
	engine := gin.New()
	engine.Use(func(c *gin.Context) { c.Set("id", 1); c.Next() })
	engine.PUT("/:org_id/remark", controller.PlatformSetOrganizationRemark)
	for _, body := range []string{`{}`, `{"remark":null}`, `{"remark":1}`, `{"remark":"` + strings.Repeat("字", 256) + `"}`} {
		req := httptest.NewRequest(http.MethodPut, "/931/remark", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		result := httptest.NewRecorder()
		engine.ServeHTTP(result, req)
		assert.Equal(t, 400, result.Code)
	}
}

func TestPlatformOrganizationGroupRejectsInvalidInput(t *testing.T) {
	engine := gin.New()
	engine.Use(func(c *gin.Context) { c.Set("id", 1); c.Next() })
	engine.PUT("/:org_id/group", controller.PlatformSetOrganizationGroup)
	for _, body := range []string{`{}`, `{"group":null}`, `{"group":"auto"}`, `{"group":"missing"}`} {
		req := httptest.NewRequest(http.MethodPut, "/931/group", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		result := httptest.NewRecorder()
		engine.ServeHTTP(result, req)
		assert.Equal(t, http.StatusBadRequest, result.Code)
	}
}

func TestPlatformMemberGovernanceRequiresPlatformAdmin(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(t.TempDir()+"/member-governance.db"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Organization{}, &model.OrganizationMember{}, &model.OrganizationAudit{}, &model.OrganizationInvite{}, &model.Token{}, &model.CasbinRule{}, &model.AuthzRole{}))
	previousDB, previousRedis, previousMaster := model.DB, common.RedisEnabled, common.IsMasterNode
	model.DB, common.RedisEnabled, common.IsMasterNode = db, false, true
	t.Cleanup(func() {
		model.DB, common.RedisEnabled, common.IsMasterNode = previousDB, previousRedis, previousMaster
		sqlDB, err := db.DB()
		require.NoError(t, err)
		require.NoError(t, sqlDB.Close())
	})
	require.NoError(t, authz.Init(db))
	users := []model.User{
		{Id: 1, Username: "root-member", AffCode: "root-member", Role: common.RoleRootUser, Status: common.UserStatusEnabled},
		{Id: 2, Username: "admin-member", AffCode: "admin-member", Role: common.RoleAdminUser, Status: common.UserStatusEnabled},
		{Id: 3, Username: "target-member", AffCode: "target-member", Role: common.RoleCommonUser, Status: common.UserStatusEnabled},
		{Id: 4, Username: "owner-member", AffCode: "owner-member", Role: common.RoleCommonUser, Status: common.UserStatusEnabled},
		{Id: 5, Username: "second-target", AffCode: "second-target", Role: common.RoleCommonUser, Status: common.UserStatusEnabled},
	}
	require.NoError(t, db.Create(&users).Error)
	require.NoError(t, db.Create(&model.Organization{Id: 931, OwnerId: 4, Name: "Managed", Status: model.OrganizationActive, Group: "default"}).Error)
	require.NoError(t, db.Create(&model.OrganizationMember{OrgId: 931, UserId: 4, Role: model.OrgRoleOwner, Status: model.OrganizationActive}).Error)
	tokens := map[int]string{1: "root-member-token", 2: "admin-member-token"}
	for id, token := range tokens {
		require.NoError(t, db.Model(&model.User{}).Where("id = ?", id).Update("access_token", token).Error)
	}
	engine := gin.New()
	setOrganizationRoutes(engine.Group("/api"))
	request := func(token, username string) *httptest.ResponseRecorder {
		body := `{"username":"` + username + `","role":"member","reason":"authorized support"}`
		req := httptest.NewRequest(http.MethodPost, "/api/platform/organizations/931/members", strings.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		engine.ServeHTTP(response, req)
		return response
	}
	response := request(tokens[2], "target-member")
	assert.Equal(t, http.StatusOK, response.Code, response.Body.String())
	response = request(tokens[1], "second-target")
	assert.Equal(t, http.StatusOK, response.Code, response.Body.String())
	var member model.OrganizationMember
	require.NoError(t, db.Where("org_id = ? AND user_id = ?", 931, 3).First(&member).Error)
}
