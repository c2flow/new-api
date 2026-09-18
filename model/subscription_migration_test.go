package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type legacyOrganizationSubscriptionPlan struct {
	SubscriptionPlan
	Audience   string `gorm:"type:varchar(16);default:'both'"`
	MaxMembers int    `gorm:"default:0"`
}

func (legacyOrganizationSubscriptionPlan) TableName() string {
	return "subscription_plans"
}

func TestSubscriptionPlanMigrationPreservesLegacyPlanData(t *testing.T) {
	db := organizationTestDatabase(t)
	require.NoError(t, db.Migrator().DropTable(&SubscriptionPlan{}))
	require.NoError(t, db.AutoMigrate(&legacyOrganizationSubscriptionPlan{}))

	legacy := legacyOrganizationSubscriptionPlan{
		SubscriptionPlan: SubscriptionPlan{Title: "Legacy team plan", Enabled: true},
		Audience:         "organization",
		MaxMembers:       25,
	}
	require.NoError(t, db.Create(&legacy).Error)

	require.NoError(t, db.AutoMigrate(&SubscriptionPlan{}))
	require.NoError(t, db.AutoMigrate(&SubscriptionPlan{}), "migration must be idempotent")

	var migrated SubscriptionPlan
	require.NoError(t, db.First(&migrated, legacy.Id).Error)
	assert.Equal(t, legacy.Title, migrated.Title)
}
