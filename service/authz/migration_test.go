package authz

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestInitUpgradesOrganizationDomainPoliciesWithoutWideningGrants(t *testing.T) {
	db := newAuthzTestDB(t)
	rules := []model.CasbinRule{
		newRule("p", []string{UserSubject(42), "*", "channel", "read", EffectDeny}),
		newRule("p", []string{UserSubject(42), "*", "channel", "sensitive_write", EffectAllow}),
		newRule("p", []string{UserSubject(43), "org:7", "channel", "sensitive_write", EffectAllow}),
		newRule("p", []string{"org-role:owner", "*", "org.member", "read", EffectAllow}),
		newRule("g", []string{UserSubject(43), "org-role:owner", "org:7"}),
		// A partially upgraded database may already contain a converted row.
		newRule("p", []string{UserSubject(42), "channel", "read", EffectDeny}),
	}
	require.NoError(t, db.Create(&rules).Error)
	for i := 0; i < 2; i++ {
		require.NoError(t, Init(db))
		require.NoError(t, ReloadPolicy())
		assert.False(t, Can(42, common.RoleAdminUser, ChannelRead))
		assert.True(t, Can(42, common.RoleAdminUser, ChannelSensitiveWrite))
		assert.False(t, Can(43, common.RoleAdminUser, ChannelSensitiveWrite))
		assert.True(t, CanOrg(43, 7, model.OrgRoleOwner, Permission{Resource: "org.member", Action: "read"}))
		assert.False(t, CanOrg(43, 7, model.OrgRoleMember, Permission{Resource: "org.billing", Action: "write"}))
	}
	require.NoError(t, SetUserPermissions(42, PermissionsMap{ResourceChannel: {ActionRead: true, ActionSensitiveWrite: false}}))
	require.NoError(t, ReloadPolicy())
	assert.True(t, Can(42, common.RoleAdminUser, ChannelRead))
	assert.False(t, Can(42, common.RoleAdminUser, ChannelSensitiveWrite))
}
