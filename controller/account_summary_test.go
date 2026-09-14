package controller

import (
	"net/http/httptest"
	"os"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func TestAccountSummarySubtractsTaskRefunds(t *testing.T) {
	var mainDialect gorm.Dialector = sqlite.Open(t.TempDir() + "/account.db")
	var logDialect gorm.Dialector = sqlite.Open(t.TempDir() + "/logs.db")
	dialect := common.DatabaseTypeSQLite
	if dsn := os.Getenv("ORGANIZATION_API_TEST_MYSQL_DSN"); dsn != "" {
		mainDialect, logDialect = mysql.Open(dsn), mysql.Open(dsn)
		dialect = common.DatabaseTypeMySQL
		if logDSN := os.Getenv("ORGANIZATION_API_TEST_LOG_MYSQL_DSN"); logDSN != "" {
			logDialect = mysql.Open(logDSN)
		}
	}
	if dsn := os.Getenv("ORGANIZATION_API_TEST_POSTGRES_DSN"); dsn != "" {
		mainDialect, logDialect = postgres.Open(dsn), postgres.Open(dsn)
		dialect = common.DatabaseTypePostgreSQL
		if logDSN := os.Getenv("ORGANIZATION_API_TEST_LOG_POSTGRES_DSN"); logDSN != "" {
			logDialect = postgres.Open(logDSN)
		}
	}
	db, err := gorm.Open(mainDialect, &gorm.Config{})
	require.NoError(t, err)
	logs, err := gorm.Open(logDialect, &gorm.Config{})
	require.NoError(t, err)
	oldBatch := common.BatchUpdateEnabled
	common.BatchUpdateEnabled = false
	oldDB, oldLogs, oldRedis := model.DB, model.LOG_DB, common.RedisEnabled
	oldMainDialect, oldLogDialect := common.MainDatabaseType(), common.LogDatabaseType()
	model.DB, model.LOG_DB, common.RedisEnabled = db, logs, false
	common.SetDatabaseTypes(dialect, dialect)
	t.Cleanup(func() {
		common.BatchUpdateEnabled = oldBatch
		model.DB, model.LOG_DB, common.RedisEnabled = oldDB, oldLogs, oldRedis
		common.SetDatabaseTypes(oldMainDialect, oldLogDialect)
		for _, connection := range []*gorm.DB{db, logs} {
			sqlDB, err := connection.DB()
			require.NoError(t, err)
			require.NoError(t, sqlDB.Close())
		}
	})
	// External DSNs must point to disposable databases.
	resources := []any{&model.User{}, &model.UserSubscription{}, &model.Token{}}
	for _, resource := range resources {
		require.NoError(t, db.Migrator().DropTable(resource))
	}
	require.NoError(t, db.AutoMigrate(resources...))
	require.NoError(t, logs.Migrator().DropTable(&model.Log{}))
	require.NoError(t, logs.AutoMigrate(&model.Log{}))
	user := model.User{Username: "refunded-user", AffCode: "refunded-user", Quota: 1000, UsedQuota: 0, RequestCount: 0}
	require.NoError(t, db.Create(&user).Error)
	for _, test := range []struct {
		name    string
		refunds []int
		want    int64
	}{
		{"no refund", nil, 100}, {"partial refund", []int{30}, 70}, {"full refund", []int{30, 70}, 0},
	} {
		t.Run(test.name, func(t *testing.T) {
			require.NoError(t, db.Model(&model.User{}).Where("id = ?", user.Id).Updates(map[string]interface{}{"used_quota": 0, "request_count": 0, "org_used_quota": 0}).Error)
			require.NoError(t, logs.Where("1 = 1").Delete(&model.Log{}).Error)
			model.UpdateUserUsedQuotaAndRequestCount(user.Id, 100)
			model.UpdateUserUsedQuotaAndRequestCount(user.Id, 500, 7)
			model.UpdateUserUsedQuota(user.Id, -200, 7)
			require.NoError(t, logs.Create(&model.Log{UserId: user.Id, Type: model.LogTypeConsume, Quota: 100}).Error)
			for _, quota := range test.refunds {
				model.UpdateUserUsedQuota(user.Id, -quota)
				require.NoError(t, logs.Create(&model.Log{UserId: user.Id, Type: model.LogTypeRefund, Quota: quota}).Error)
			}
			for _, unrelated := range []model.Log{
				{UserId: user.Id, Type: model.LogTypeTopup, Quota: 900},
				{UserId: user.Id, OrgId: 7, Type: model.LogTypeConsume, Quota: 500},
				{UserId: user.Id, OrgId: 7, Type: model.LogTypeRefund, Quota: 200},
				{UserId: user.Id + 1, Type: model.LogTypeRefund, Quota: 100},
			} {
				require.NoError(t, logs.Create(&unrelated).Error)
			}
			for _, cleared := range []bool{false, true} {
				if cleared {
					require.NoError(t, logs.Where("1 = 1").Delete(&model.Log{}).Error)
				}
				response := httptest.NewRecorder()
				c, _ := gin.CreateTestContext(response)
				c.Request = httptest.NewRequest("GET", "/api/account/summary", nil)
				c.Set("id", user.Id)
				GetAccountSummary(c)
				var body struct {
					Success bool
					Data    struct {
						UsedQuota    int64 `json:"used_quota"`
						RequestCount int64 `json:"request_count"`
					}
				}
				require.NoError(t, common.Unmarshal(response.Body.Bytes(), &body))
				require.True(t, body.Success, response.Body.String())
				assert.Equal(t, test.want, body.Data.UsedQuota)
				if !cleared {
					assert.Equal(t, int64(1), body.Data.RequestCount, "refunds do not count as new requests")
				}
			}
		})
	}
}
