package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPlatformAddOrganizationMemberBypassesConsentAndSupersedesInvites(t *testing.T) {
	db := organizationTestDatabase(t)
	users := []User{
		{Username: "owner", AffCode: "owner", Status: common.UserStatusEnabled},
		{Username: "managed", AffCode: "managed", Status: common.UserStatusEnabled},
	}
	require.NoError(t, db.Create(&users).Error)
	org, err := CreateTeamOrganization(users[0].Id, "Managed team")
	require.NoError(t, err)
	invite, err := CreateOrganizationInvite(org.Id, users[0].Id, users[1].Username, OrgRoleMember)
	require.NoError(t, err)

	member, err := PlatformAddOrganizationMember(org.Id, users[0].Id, PlatformOrganizationMemberInput{
		Username: users[1].Username, Role: OrgRoleAdmin, SpendLimit: 100, MonthlySpendLimit: 25, Reason: "authorized onboarding",
	})
	require.NoError(t, err)
	assert.Equal(t, users[1].Id, member.UserId)
	assert.Equal(t, OrgRoleAdmin, member.Role)
	assert.Equal(t, int64(100), member.SpendLimit)
	assert.Equal(t, int64(25), member.MonthlySpendLimit)
	require.NoError(t, db.First(invite, invite.Id).Error)
	assert.Equal(t, "superseded", invite.Status)
	_, _, err = GetOrganizationMembership(org.Id, users[1].Id)
	require.NoError(t, err)
	memberships, err := ListUserOrganizations(users[1].Id)
	require.NoError(t, err)
	require.Len(t, memberships, 1)
	assert.Equal(t, "platform", memberships[0].JoinSource)

	var audit OrganizationAudit
	require.NoError(t, db.Scopes(OrgScope(org.Id)).Where("action = ?", "platform.member_add").First(&audit).Error)
	assert.Equal(t, users[0].Id, audit.ActorId)
	assert.Contains(t, audit.Reason, "authorized onboarding")
	assert.Contains(t, audit.Reason, "role: admin")

	_, err = PlatformAddOrganizationMember(org.Id, users[0].Id, PlatformOrganizationMemberInput{
		Username: users[1].Username, Role: OrgRoleMember, Reason: "duplicate",
	})
	assert.ErrorIs(t, err, ErrOrganizationMemberExists)
}

func TestPlatformMemberGovernanceProtectsOwnerAndDisablesTokens(t *testing.T) {
	db, org, users := organizationBillingFixture(t)
	memberID := users[1].Id
	token := Token{OrgId: org.Id, UserId: memberID, Name: "managed-key", Key: "managed-key", Status: common.TokenStatusEnabled}
	require.NoError(t, db.Create(&token).Error)

	var member OrganizationMember
	require.NoError(t, db.Where("org_id = ? AND user_id = ?", org.Id, memberID).First(&member).Error)
	total, monthly := int64(80), int64(20)
	require.NoError(t, PlatformUpdateOrganizationMember(org.Id, users[0].Id, memberID, OrgRoleAdmin, OrganizationDisabled, &total, &monthly, "access review"))
	require.NoError(t, db.First(&token, token.Id).Error)
	assert.Equal(t, common.TokenStatusDisabled, token.Status)
	require.NoError(t, db.First(&member, member.Id).Error)
	assert.Equal(t, OrgRoleAdmin, member.Role)
	assert.Equal(t, OrganizationDisabled, member.Status)
	assert.Equal(t, int64(80), member.SpendLimit)
	assert.Equal(t, int64(20), member.MonthlySpendLimit)
	assert.True(t, member.SpendLimitEnabled)
	assert.True(t, member.MonthlySpendLimitEnabled)

	zero := int64(0)
	assert.ErrorIs(t, PlatformUpdateOrganizationMember(org.Id, users[0].Id, users[0].Id, OrgRoleMember, OrganizationActive, &zero, &zero, "invalid owner edit"), ErrOrganizationOwner)
	invalid := int64(-1)
	assert.ErrorIs(t, PlatformUpdateOrganizationMember(org.Id, users[0].Id, memberID, OrgRoleMember, OrganizationActive, &invalid, &zero, "invalid"), ErrOrganizationInput)
}
