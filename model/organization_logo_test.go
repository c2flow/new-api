package model

import (
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestOrganizationListIncludesLogoWithoutPrivateSettings(t *testing.T) {
	db, org, users := organizationBillingFixture(t)
	require.NoError(t, db.Model(org).Update("settings", `{"logo":"https://example.test/team.png"}`).Error)
	for _, user := range users {
		rows, err := ListUserOrganizations(user.Id)
		require.NoError(t, err)
		require.Len(t, rows, 1)
		assert.Equal(t, "https://example.test/team.png", rows[0].Logo)
		assert.Empty(t, rows[0].Settings)
		if user.Id == users[1].Id {
			assert.Zero(t, rows[0].Quota)
		}
	}
	require.NoError(t, db.Model(org).Update("settings", `{}`).Error)
	rows, err := ListUserOrganizations(users[0].Id)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	assert.Empty(t, rows[0].Logo)
}

func TestOrganizationListReturnsNewestMembershipFirst(t *testing.T) {
	db := organizationTestDatabase(t)
	user := User{Username: "member-order", AffCode: "member-order"}
	require.NoError(t, db.Create(&user).Error)
	older, err := CreateTeamOrganization(user.Id, "Older team")
	require.NoError(t, err)
	newer, err := CreateTeamOrganization(user.Id, "Newer team")
	require.NoError(t, err)
	require.NoError(t, db.Model(&OrganizationMember{}).Where("org_id = ? AND user_id = ?", older.Id, user.Id).Update("created_at", 100).Error)
	require.NoError(t, db.Model(&OrganizationMember{}).Where("org_id = ? AND user_id = ?", newer.Id, user.Id).Update("created_at", 200).Error)

	rows, err := ListUserOrganizations(user.Id)
	require.NoError(t, err)
	require.Len(t, rows, 2)
	assert.Equal(t, newer.Id, rows[0].Id)
	assert.Equal(t, int64(200), rows[0].JoinedAt)
	assert.Positive(t, rows[0].MembershipId)
	assert.Equal(t, older.Id, rows[1].Id)
	assert.Equal(t, int64(100), rows[1].JoinedAt)
	assert.Positive(t, rows[1].MembershipId)
}
