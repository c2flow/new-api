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
