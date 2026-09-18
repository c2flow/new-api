package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestOrganizationAdminCannotManageAdministratorPrivileges(t *testing.T) {
	db := organizationTestDatabase(t)
	users := []User{
		{Username: "owner", AffCode: "owner", Status: common.UserStatusEnabled},
		{Username: "admin", AffCode: "admin", Status: common.UserStatusEnabled},
		{Username: "peer-admin", AffCode: "peer-admin", Status: common.UserStatusEnabled},
		{Username: "member", AffCode: "member", Status: common.UserStatusEnabled},
		{Username: "invitee", AffCode: "invitee", Status: common.UserStatusEnabled},
	}
	require.NoError(t, db.Create(&users).Error)
	org, err := CreateTeamOrganization(users[0].Id, "Team")
	require.NoError(t, err)
	members := []OrganizationMember{
		{OrgId: org.Id, UserId: users[1].Id, Role: OrgRoleAdmin, Status: OrganizationActive},
		{OrgId: org.Id, UserId: users[2].Id, Role: OrgRoleAdmin, Status: OrganizationActive},
		{OrgId: org.Id, UserId: users[3].Id, Role: OrgRoleMember, Status: OrganizationActive},
	}
	require.NoError(t, db.Create(&members).Error)

	assert.ErrorIs(t, UpdateOrganizationMember(org.Id, users[1].Id, users[3].Id, OrgRoleAdmin, OrganizationActive), ErrOrganizationAccess)
	for _, status := range []int{OrganizationActive, OrganizationDisabled, OrganizationDeleting} {
		assert.ErrorIs(t, UpdateOrganizationMember(org.Id, users[1].Id, users[2].Id, OrgRoleMember, status), ErrOrganizationAccess)
	}
	assert.ErrorIs(t, UpdateOrganizationMember(org.Id, users[1].Id, users[2].Id, OrgRoleAdmin, OrganizationDisabled), ErrOrganizationAccess)

	var peer OrganizationMember
	require.NoError(t, db.Where("org_id = ? AND user_id = ?", org.Id, users[2].Id).First(&peer).Error)
	assert.Equal(t, OrgRoleAdmin, peer.Role)
	assert.Equal(t, OrganizationActive, peer.Status)
	_, err = CreateOrganizationInvite(org.Id, users[1].Id, users[4].Username, OrgRoleAdmin)
	assert.ErrorIs(t, err, ErrOrganizationAccess)

	require.NoError(t, UpdateOrganizationMember(org.Id, users[0].Id, users[2].Id, OrgRoleMember, OrganizationActive))
	require.NoError(t, UpdateOrganizationMember(org.Id, users[0].Id, users[2].Id, OrgRoleAdmin, OrganizationDisabled))
	require.NoError(t, UpdateOrganizationMember(org.Id, users[1].Id, users[3].Id, OrgRoleMember, OrganizationDisabled))
	invite, err := CreateOrganizationInvite(org.Id, users[0].Id, users[4].Username, OrgRoleAdmin)
	require.NoError(t, err)
	assert.Equal(t, OrgRoleAdmin, invite.Role)
}
