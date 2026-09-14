package model

import (
	"errors"
	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	"testing"
)

func TestOrganizationQuotaAdjustment(t *testing.T) {
	db, org, users := organizationBillingFixture(t)
	for _, test := range []struct {
		mode        string
		value, want int64
	}{{"add", 200, 1200}, {"subtract", 300, 900}, {"override", 0, 0}, {"override", -100, -100}, {"add", 150, 50}} {
		got, err := AdjustOrganizationQuota(org.Id, users[0].Id, test.mode, test.value, "correction")
		require.NoError(t, err)
		assert.Equal(t, test.want, got)
	}
	var audits []OrganizationAudit
	require.NoError(t, db.Order("id").Where("action LIKE ?", "platform.quota_%").Find(&audits).Error)
	require.Len(t, audits, 5)
	assert.Contains(t, audits[0].Reason, "1000 -> 1200")
	assert.Equal(t, users[0].Id, audits[0].ActorId)
	require.NoError(t, db.First(org, org.Id).Error)
	assert.Equal(t, int64(50), org.Quota)
	assert.Zero(t, org.UsedQuota)
	require.NoError(t, db.First(&users[0], users[0].Id).Error)
	assert.Equal(t, 999, users[0].Quota)
	for _, test := range []struct {
		mode   string
		value  int64
		reason string
	}{{"add", 0, "r"}, {"subtract", -1, "r"}, {"unknown", 1, "r"}, {"override", int64(common.MaxWalletQuota) + 1, "r"}, {"override", -int64(common.MaxWalletQuota) - 1, "r"}, {"add", 1, " "}, {"add", int64(common.MaxWalletQuota), "r"}} {
		_, err := AdjustOrganizationQuota(org.Id, users[0].Id, test.mode, test.value, test.reason)
		assert.ErrorIs(t, err, ErrOrganizationInput)
	}
	_, err := AdjustOrganizationQuota(org.Id, users[0].Id, "override", -int64(common.MaxWalletQuota), "boundary")
	require.NoError(t, err)
	_, err = AdjustOrganizationQuota(org.Id, users[0].Id, "subtract", 1, "boundary")
	assert.ErrorIs(t, err, ErrOrganizationInput)
	// Failure to write the audit must roll back the balance too.
	injected := errors.New("audit unavailable")
	require.NoError(t, db.Callback().Create().Before("gorm:create").Register("quota:audit-failure", func(tx *gorm.DB) {
		if tx.Statement.Table == "organization_audits" {
			tx.AddError(injected)
		}
	}))
	_, err = AdjustOrganizationQuota(org.Id, users[0].Id, "override", 99, "rollback")
	assert.ErrorIs(t, err, injected)
	require.NoError(t, db.Callback().Create().Remove("quota:audit-failure"))
	require.NoError(t, db.First(org, org.Id).Error)
	assert.Equal(t, -int64(common.MaxWalletQuota), org.Quota)
	require.NoError(t, db.Model(org).Update("status", OrganizationDeleting).Error)
	_, err = AdjustOrganizationQuota(org.Id, users[0].Id, "add", 1, "deleted")
	assert.ErrorIs(t, err, ErrOrganizationAccess)
}

func TestOrganizationQuotaConcurrentAdjustmentsPreserveBothChanges(t *testing.T) {
	db, org, users := organizationBillingFixture(t)
	if common.UsingMainDatabase(common.DatabaseTypeSQLite) {
		sqlDB, err := db.DB()
		require.NoError(t, err)
		sqlDB.SetMaxOpenConns(1)
	}
	done := make(chan error, 2)
	for _, amount := range []int64{100, 200} {
		go func(value int64) {
			_, err := AdjustOrganizationQuota(org.Id, users[0].Id, "add", value, "concurrent adjustment")
			done <- err
		}(amount)
	}
	require.NoError(t, <-done)
	require.NoError(t, <-done)
	require.NoError(t, db.First(org, org.Id).Error)
	assert.Equal(t, int64(1300), org.Quota)
	var count int64
	require.NoError(t, db.Model(&OrganizationAudit{}).Where("org_id = ? AND action = ?", org.Id, "platform.quota_add").Count(&count).Error)
	assert.Equal(t, int64(2), count)
}
