package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/alicebob/miniredis/v2"
	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis/v8"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestOrganizationTokenAuthReadsCurrentGroupAndTokenPolicy(t *testing.T) {
	setupDashboardAuthMiddlewareTest(t)
	previousUsableGroups := setting.UserUsableGroups2JSONString()
	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"default":"Default","premium":"Premium","vip":"VIP","auto":"Auto"}`))
	t.Cleanup(func() { require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(previousUsableGroups)) })
	previousPath, previousMaster := common.SQLitePath, common.IsMasterNode
	common.SQLitePath, common.IsMasterNode = t.TempDir()+"/auth.db", false
	t.Setenv("SQL_DSN", "")
	require.NoError(t, model.InitDB())
	db := model.DB
	t.Cleanup(func() {
		sqlDB, err := db.DB()
		require.NoError(t, err)
		require.NoError(t, sqlDB.Close())
		common.SQLitePath, common.IsMasterNode = previousPath, previousMaster
	})
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Organization{}, &model.OrganizationMember{}, &model.Token{}))
	server := miniredis.RunT(t)
	oldRDB := common.RDB
	common.RDB = redis.NewClient(&redis.Options{Addr: server.Addr()})
	common.RedisEnabled = true
	t.Cleanup(func() { require.NoError(t, common.RDB.Close()); common.RDB = oldRDB })
	user := model.User{Username: "owner", Status: common.UserStatusEnabled, Group: "default", AuthVersion: 1}
	require.NoError(t, db.Create(&user).Error)
	org := model.Organization{Name: "Team", Status: model.OrganizationActive, Group: "default"}
	require.NoError(t, db.Create(&org).Error)
	member := model.OrganizationMember{OrgId: org.Id, UserId: user.Id, Status: model.OrganizationActive}
	require.NoError(t, db.Create(&member).Error)
	token := model.Token{OrgId: org.Id, UserId: user.Id, Key: "organizationauth", Status: common.TokenStatusEnabled, ExpiredTime: -1, UnlimitedQuota: true, ModelLimitsEnabled: true, ModelLimits: "allowed,new", Group: "auto", CrossGroupRetry: true, AutoGroups: `["vip"]`}
	require.NoError(t, db.Create(&token).Error)
	router := gin.New()
	router.GET("/relay", TokenAuth(), func(c *gin.Context) {
		_, hasAutoGroups := common.GetContextKey(c, constant.ContextKeyTokenAutoGroups)
		c.JSON(http.StatusOK, gin.H{
			"group":       c.GetString("user_group"),
			"using_group": c.GetString("group"),
			"token_group": c.GetString("token_group"),
			"cross_retry": c.GetBool("token_cross_group_retry"),
			"has_auto":    hasAutoGroups,
			"models":      c.MustGet("token_model_limit"),
		})
	})
	router.GET("/readonly", TokenAuthReadOnly(), func(c *gin.Context) { c.Status(http.StatusNoContent) })
	request := func(path string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		req.Header.Set("Authorization", "Bearer sk-"+token.Key)
		response := httptest.NewRecorder()
		router.ServeHTTP(response, req)
		return response
	}
	response := request("/relay")
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	assert.JSONEq(t, `{"group":"default","using_group":"auto","token_group":"auto","cross_retry":true,"has_auto":true,"models":{"allowed":true,"new":true}}`, response.Body.String())
	require.NoError(t, db.Model(&org).Update("group", "premium").Error)
	previousRatios := ratio_setting.GroupRatio2JSONString()
	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"default":1,"premium":1}`))
	t.Cleanup(func() { require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(previousRatios)) })
	response = request("/relay")
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	assert.JSONEq(t, `{"group":"premium","using_group":"auto","token_group":"auto","cross_retry":true,"has_auto":true,"models":{"allowed":true,"new":true}}`, response.Body.String())
	require.NoError(t, db.Model(&org).Update("group", "removed").Error)
	assert.Equal(t, http.StatusForbidden, request("/relay").Code)
	require.NoError(t, db.Model(&org).Update("group", "premium").Error)
	for _, status := range []int{model.OrganizationDisabled, model.OrganizationSuspended} {
		require.NoError(t, db.Model(&org).Update("status", status).Error)
		assert.Equal(t, http.StatusForbidden, request("/relay").Code)
		assert.Equal(t, http.StatusForbidden, request("/readonly").Code)
	}
	require.NoError(t, db.Model(&org).Update("status", model.OrganizationActive).Error)
	assert.Equal(t, http.StatusOK, request("/relay").Code)
	assert.Equal(t, http.StatusNoContent, request("/readonly").Code)
	require.NoError(t, db.Model(&member).Update("status", model.OrganizationDisabled).Error)
	assert.Equal(t, http.StatusForbidden, request("/relay").Code)
	assert.Equal(t, http.StatusForbidden, request("/readonly").Code)
	require.NoError(t, db.Model(&member).Update("status", model.OrganizationActive).Error)
	require.NoError(t, db.Delete(&org).Error)
	assert.Equal(t, http.StatusForbidden, request("/relay").Code)
	assert.Equal(t, http.StatusForbidden, request("/readonly").Code)
	require.NoError(t, db.Migrator().DropTable(&model.OrganizationMember{}))
	assert.Equal(t, http.StatusInternalServerError, request("/relay").Code)
	assert.Equal(t, http.StatusInternalServerError, request("/readonly").Code)
}
