package model

import (
	"fmt"
	"os"
	"sync/atomic"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestOrganizationOwnerDeletionRequiresHandoff(t *testing.T) {
	for _, hard := range []bool{false, true} {
		for _, status := range []int{OrganizationActive, OrganizationDisabled, OrganizationSuspended} {
			t.Run(fmt.Sprintf("hard=%t/status=%d", hard, status), func(t *testing.T) {
				db, org, users := organizationBillingFixture(t)
				require.NoError(t, db.Model(org).Update("status", status).Error)
				deleteUser := DeleteUserById
				if hard {
					deleteUser = HardDeleteUserById
				}
				require.ErrorIs(t, deleteUser(users[0].Id), ErrUserOwnsOrganizations)
				var owner User
				require.NoError(t, db.First(&owner, users[0].Id).Error)
				assert.Equal(t, users[0].AuthVersion, owner.AuthVersion, "a rejected deletion must not revoke authentication")
				require.NoError(t, db.First(org, org.Id).Error)
				assert.Equal(t, users[0].Id, org.OwnerId)
				assert.Equal(t, int64(1000), org.Quota)
			})
		}
	}
}

func TestOrganizationFormerOwnerCanDeleteAccountAfterTransfer(t *testing.T) {
	db, org, users := organizationBillingFixture(t)
	require.NoError(t, db.AutoMigrate(&UserSession{}))
	require.NoError(t, RequestOrganizationTransfer(org.Id, users[0].Id, users[1].Id))
	require.NoError(t, AcceptOrganizationTransfer(org.Id, users[1].Id))
	require.NoError(t, DeleteUserById(users[0].Id))
	require.NoError(t, db.First(org, org.Id).Error)
	assert.Equal(t, users[1].Id, org.OwnerId)
	assert.Equal(t, int64(1000), org.Quota)
	require.NoError(t, ChangeOrganizationStatus(org.Id, users[1].Id, OrganizationDisabled, ""))
}

func TestOrganizationTransferCannotAssignDeletedAccount(t *testing.T) {
	db, org, users := organizationBillingFixture(t)
	require.NoError(t, db.AutoMigrate(&UserSession{}))
	require.NoError(t, RequestOrganizationTransfer(org.Id, users[0].Id, users[1].Id))
	require.NoError(t, DeleteUserById(users[1].Id))
	assert.ErrorIs(t, AcceptOrganizationTransfer(org.Id, users[1].Id), ErrOrganizationAccess)
	require.NoError(t, db.First(org, org.Id).Error)
	assert.Equal(t, users[0].Id, org.OwnerId)
	_, err := CreateTeamOrganization(users[1].Id, "Deleted owner")
	assert.ErrorIs(t, err, gorm.ErrRecordNotFound)
}

func TestOrganizationDeletedTeamDoesNotPreventAccountDeletion(t *testing.T) {
	db, org, users := organizationBillingFixture(t)
	require.NoError(t, db.AutoMigrate(&UserSession{}))
	require.NoError(t, db.Model(org).Update("quota", 0).Error)
	require.NoError(t, ChangeOrganizationStatus(org.Id, users[0].Id, OrganizationDeleting, org.Name))
	require.NoError(t, DeleteUserById(users[0].Id))
	var user User
	assert.ErrorIs(t, db.First(&user, users[0].Id).Error, gorm.ErrRecordNotFound)
}

func TestOrganizationAccountDeletionCannotRaceOwnershipAcquisition(t *testing.T) {
	if os.Getenv("TENANCY_TEST_MYSQL_DSN") == "" && os.Getenv("TENANCY_TEST_POSTGRES_DSN") == "" {
		t.Skip("requires row locks; SQLite serializes writes")
	}
	for _, transfer := range []bool{false, true} {
		t.Run(fmt.Sprintf("transfer=%t", transfer), func(t *testing.T) {
			db, org, users := organizationBillingFixture(t)
			require.NoError(t, db.AutoMigrate(&UserSession{}))
			if transfer {
				require.NoError(t, RequestOrganizationTransfer(org.Id, users[0].Id, users[1].Id))
			}
			read, resume := make(chan struct{}), make(chan struct{})
			var intercepted atomic.Bool
			require.NoError(t, db.Callback().Query().Before("gorm:query").Register("organization:pause-owner-user", func(tx *gorm.DB) {
				if tx.Statement.Table == "users" && intercepted.CompareAndSwap(false, true) {
					close(read)
					<-resume
				}
			}))
			defer db.Callback().Query().Remove("organization:pause-owner-user")
			acquired := make(chan error, 1)
			go func() {
				if transfer {
					acquired <- AcceptOrganizationTransfer(org.Id, users[1].Id)
					return
				}
				_, err := CreateTeamOrganization(users[1].Id, "New team")
				acquired <- err
			}()
			<-read
			deletionErr := DeleteUserById(users[1].Id)
			close(resume)
			require.NoError(t, deletionErr)
			assert.Error(t, <-acquired)
			var owned int64
			require.NoError(t, db.Model(&Organization{}).Where("owner_id = ?", users[1].Id).Count(&owned).Error)
			assert.Zero(t, owned)
		})
	}
}
