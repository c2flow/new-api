package model

import (
	"os"
	"sync/atomic"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestOrganizationDeclineDoesNotOverwriteConcurrentAcceptance(t *testing.T) {
	if os.Getenv("TENANCY_TEST_MYSQL_DSN") == "" {
		t.Skip("requires MySQL repeatable-read")
	}
	db, org, users := organizationBillingFixture(t)
	require.NoError(t, db.Where("org_id = ? AND user_id = ?", org.Id, users[1].Id).Delete(&OrganizationMember{}).Error)
	invite, err := CreateOrganizationInvite(org.Id, users[0].Id, users[1].Username, OrgRoleMember)
	require.NoError(t, err)
	read := make(chan struct{})
	resume := make(chan struct{})
	var intercepted atomic.Bool
	require.NoError(t, db.Callback().Query().After("gorm:query").Register("organization:pause-invite", func(tx *gorm.DB) {
		if tx.Statement.Table == "organization_invites" && intercepted.CompareAndSwap(false, true) {
			close(read)
			<-resume
		}
	}))
	defer db.Callback().Query().Remove("organization:pause-invite")
	declined := make(chan error, 1)
	go func() { declined <- DeclineOrganizationInvite(users[1].Id, invite.Id) }()
	<-read
	_, acceptErr := AcceptOrganizationInvite(users[1].Id, invite.Id)
	close(resume)
	require.NoError(t, acceptErr)
	declineErr := <-declined
	assert.ErrorIs(t, declineErr, ErrOrganizationInvite, "an accepted invitation cannot be declined")
	require.NoError(t, db.First(invite, invite.Id).Error)
	assert.Equal(t, "accepted", invite.Status)
	var member OrganizationMember
	require.NoError(t, db.Where("org_id = ? AND user_id = ?", org.Id, users[1].Id).First(&member).Error)
	assert.Equal(t, OrganizationActive, member.Status)
}

func TestOrganizationScopedFlowDoesNotExposePlatformChannels(t *testing.T) {
	db, org, users := organizationBillingFixture(t)
	for _, orgID := range []int{0, org.Id} {
		for _, channelID := range []int{11, 22} {
			require.NoError(t, db.Create(&QuotaData{OrgId: orgID, UserID: users[0].Id, Username: users[0].Username, ModelName: "model", CreatedAt: 1000, UseGroup: "default", ChannelID: channelID, Count: 1, Quota: 100}).Error)
		}
		rows, err := GetScopedFlowQuotaData(ResourceScope{OrgID: orgID, UserID: users[0].Id, AllMembers: orgID > 0}, 900, 1100)
		require.NoError(t, err)
		require.Len(t, rows, 1, "channel routing must not split personal/team usage rows")
		assert.Equal(t, 2, rows[0].Count)
		assert.Equal(t, 200, rows[0].Quota)
		assert.Zero(t, rows[0].ChannelID)
		assert.Empty(t, rows[0].ChannelName)
		if orgID == 0 {
			assert.Empty(t, rows[0].Username)
		} else {
			assert.Equal(t, users[0].Username, rows[0].Username)
		}
	}
}
