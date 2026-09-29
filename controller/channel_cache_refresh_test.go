package controller

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestAddChannelRefreshesDistributorCache(t *testing.T) {
	originalDB, originalLogDB := model.DB, model.LOG_DB
	originalMemoryCacheEnabled := common.MemoryCacheEnabled
	originalRedisEnabled := common.RedisEnabled

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	require.NoError(t, db.AutoMigrate(&model.Channel{}, &model.Ability{}))

	model.DB = db
	model.LOG_DB = db
	common.MemoryCacheEnabled = true
	common.RedisEnabled = false
	model.InitChannelCache()

	t.Cleanup(func() {
		common.MemoryCacheEnabled = originalMemoryCacheEnabled
		common.RedisEnabled = originalRedisEnabled
		model.DB = originalDB
		model.LOG_DB = originalLogDB
		_ = sqlDB.Close()
	})

	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/channel", strings.NewReader(`{
		"mode":"single",
		"channel":{
			"type":1,
			"name":"cache-refresh-channel",
			"key":"test-key",
			"models":"cache-refresh-model",
			"group":"cache-refresh-group",
			"status":1
		}
	}`))
	ctx.Request.Header.Set("Content-Type", "application/json")

	AddChannel(ctx)

	assert.Equal(t, http.StatusOK, recorder.Code)
	assert.Contains(t, recorder.Body.String(), `"success":true`)

	channel, err := model.GetRandomSatisfiedChannel("cache-refresh-group", "cache-refresh-model", 0, nil)
	require.NoError(t, err)
	require.NotNil(t, channel)
	assert.Equal(t, "cache-refresh-channel", channel.Name)
}
