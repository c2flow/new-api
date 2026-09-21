package model

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"strings"
	"testing"
)

func TestOrganizationNameOnlyCreationAllowsDuplicateNames(t *testing.T) {
	db := organizationTestDatabase(t)
	user := User{Username: "name-owner", AffCode: "name-owner"}
	require.NoError(t, db.Create(&user).Error)
	first, err := CreateTeamOrganization(user.Id, " 同名团队 ")
	require.NoError(t, err)
	second, err := CreateTeamOrganization(user.Id, "同名团队")
	require.NoError(t, err)
	assert.Equal(t, "同名团队", first.Name)
	assert.Equal(t, first.Name, second.Name)
	assert.NotEqual(t, first.Id, second.Id)
}

func TestOrganizationDeletionRequiresCurrentName(t *testing.T) {
	db, org, users := organizationBillingFixture(t)
	require.NoError(t, db.Model(org).Updates(map[string]interface{}{"quota": 0, "name": "Renamed 团队"}).Error)
	assert.ErrorIs(t, ChangeOrganizationStatus(org.Id, users[0].Id, OrganizationDeleting, ""), ErrOrganizationInput)
	assert.ErrorIs(t, ChangeOrganizationStatus(org.Id, users[0].Id, OrganizationDeleting, "Team"), ErrOrganizationInput)
	require.NoError(t, ChangeOrganizationStatus(org.Id, users[0].Id, OrganizationDeleting, "Renamed 团队"))
	var count int64
	require.NoError(t, db.Model(&Organization{}).Where("id = ?", org.Id).Count(&count).Error)
	assert.Zero(t, count)
}

func TestOrganizationNameIsImmutableWhenUpdatingSettings(t *testing.T) {
	db, org, users := organizationBillingFixture(t)
	settings := OrganizationSettings{Logo: "https://example.test/logo.png", DefaultSpendLimit: 100}
	assert.ErrorIs(t, UpdateOrganizationSettings(org.Id, users[0].Id, "New name", settings), ErrOrganizationInput)
	var unchanged Organization
	require.NoError(t, db.First(&unchanged, org.Id).Error)
	assert.Equal(t, org.Name, unchanged.Name)
	assert.Equal(t, org.Settings, unchanged.Settings)
	require.NoError(t, UpdateOrganizationSettings(org.Id, users[0].Id, org.Name, settings))
	require.NoError(t, db.First(&unchanged, org.Id).Error)
	assert.Equal(t, org.Name, unchanged.Name)
	got, err := unchanged.EffectiveSettings()
	require.NoError(t, err)
	assert.Equal(t, settings.Logo, got.Logo)
	assert.Equal(t, settings.DefaultSpendLimit, got.DefaultSpendLimit)
	assert.JSONEq(t, `{"logo":"https://example.test/logo.png","default_spend_limit":100}`, unchanged.Settings)
}

func TestOrganizationSettingsIgnoreRemovedFeatures(t *testing.T) {
	legacy := Organization{Settings: `{"logo":"https://example.test/logo.png","default_spend_limit":100,"alert_email":"finance@example.test","webhook":"https://example.test/hook","budget_limit":500,"alert_percent":80,"allowed_models":["gpt-4o"]}`}

	settings, err := legacy.EffectiveSettings()
	require.NoError(t, err)
	data, err := common.Marshal(settings)
	require.NoError(t, err)
	assert.JSONEq(t, `{"logo":"https://example.test/logo.png","default_spend_limit":100}`, string(data))
}

func TestOrganizationRemarkUpgradePreservesExistingTeams(t *testing.T) {
	db, org, users := organizationBillingFixture(t)
	require.NoError(t, db.Migrator().DropColumn(&Organization{}, "remark"))
	for i := 0; i < 2; i++ {
		require.NoError(t, db.AutoMigrate(&Organization{}))
		var got Organization
		require.NoError(t, db.First(&got, org.Id).Error)
		assert.Equal(t, *org, got)
		assert.True(t, db.Migrator().HasIndex(&Organization{}, "idx_organizations_owner_id"))
		assert.True(t, db.Migrator().HasIndex(&Organization{}, "idx_organizations_deleted_at"))
	}
	require.NoError(t, PlatformSetOrganizationRemark(org.Id, users[0].Id, " 客户甲 "))
	var got Organization
	require.NoError(t, db.First(&got, org.Id).Error)
	assert.Equal(t, "客户甲", got.Remark)
	data, err := common.Marshal(got)
	require.NoError(t, err)
	assert.NotContains(t, string(data), "客户甲")
	assert.NotContains(t, string(data), "remark")
	assert.ErrorIs(t, PlatformSetOrganizationRemark(org.Id, users[0].Id, strings.Repeat("字", 256)), ErrOrganizationInput)
	require.NoError(t, PlatformSetOrganizationRemark(org.Id, users[0].Id, ""))
	require.NoError(t, db.First(&got, org.Id).Error)
	assert.Empty(t, got.Remark)
	var audits []OrganizationAudit
	require.NoError(t, db.Where("org_id = ? AND action = ?", org.Id, "platform.remark").Find(&audits).Error)
	require.Len(t, audits, 2)
	for _, audit := range audits {
		assert.Empty(t, audit.Reason)
	}
}

func TestPlatformSetOrganizationGroupUpdatesCurrentPolicyAndAuditsChange(t *testing.T) {
	db, org, users := organizationBillingFixture(t)

	require.NoError(t, PlatformSetOrganizationGroup(org.Id, users[0].Id, " vip "))
	var updated Organization
	require.NoError(t, db.First(&updated, org.Id).Error)
	assert.Equal(t, "vip", updated.Group)

	var audits []OrganizationAudit
	require.NoError(t, db.Where("org_id = ? AND action = ?", org.Id, "platform.group").Find(&audits).Error)
	require.Len(t, audits, 1)
	assert.Equal(t, "vip", audits[0].ObjectId)

	require.NoError(t, PlatformSetOrganizationGroup(org.Id, users[0].Id, "vip"))
	require.NoError(t, db.Where("org_id = ? AND action = ?", org.Id, "platform.group").Find(&audits).Error)
	assert.Len(t, audits, 1)
	assert.ErrorIs(t, PlatformSetOrganizationGroup(org.Id, users[0].Id, ""), ErrOrganizationInput)
}
