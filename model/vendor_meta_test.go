package model

import (
	"fmt"
	"os"
	"strings"
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func TestVendorOverseasPolicyPersistsAutomaticAndExplicitValues(t *testing.T) {
	testCases := []struct {
		name      string
		env       string
		dialector func(string) gorm.Dialector
	}{
		{name: "sqlite", dialector: func(string) gorm.Dialector {
			return sqlite.Open(fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_")))
		}},
		{name: "mysql", env: "TEST_MYSQL_DSN", dialector: func(dsn string) gorm.Dialector { return mysql.Open(dsn) }},
		{name: "postgres", env: "TEST_POSTGRES_DSN", dialector: func(dsn string) gorm.Dialector {
			return postgres.New(postgres.Config{DSN: dsn, PreferSimpleProtocol: true})
		}},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			dsn := ""
			if testCase.env != "" {
				dsn = strings.TrimSpace(os.Getenv(testCase.env))
				if dsn == "" {
					t.Skip(testCase.env + " is not configured")
				}
			}

			db, err := gorm.Open(testCase.dialector(dsn), &gorm.Config{})
			require.NoError(t, err)
			tableName := "vendor_overseas_policy_" + testCase.name
			t.Cleanup(func() {
				require.NoError(t, db.Migrator().DropTable(tableName))
			})

			require.NoError(t, db.Table(tableName).AutoMigrate(&Vendor{}))
			require.NoError(t, db.Table(tableName).AutoMigrate(&Vendor{}), "migration must be idempotent")

			explicitFalse := false
			require.NoError(t, db.Table(tableName).Create(&Vendor{Name: "OpenAI", Status: 1}).Error)
			require.NoError(t, db.Table(tableName).Create(&Vendor{Name: "Local", Status: 1, OverseasOnly: &explicitFalse}).Error)

			var automatic Vendor
			require.NoError(t, db.Table(tableName).Where("name = ?", "OpenAI").First(&automatic).Error)
			assert.Nil(t, automatic.OverseasOnly)

			var overridden Vendor
			require.NoError(t, db.Table(tableName).Where("name = ?", "Local").First(&overridden).Error)
			require.NotNil(t, overridden.OverseasOnly)
			assert.False(t, *overridden.OverseasOnly)
		})
	}
}
