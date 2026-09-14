package model

import (
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
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
