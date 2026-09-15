package model

import (
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestOrganizationMonthlyLimitIsOptionalAndIndependent(t *testing.T) {
	db, org, users := organizationBillingFixture(t)
	uid := users[1].Id
	require.NoError(t, db.Model(&OrganizationMember{}).Where("org_id = ? AND user_id = ?", org.Id, uid).Update("spend_limit", 0).Error)
	receipt, err := ReserveOrganizationCharge(org.Id, uid, 0, "before-enabled", 150)
	require.NoError(t, err)
	require.NoError(t, FinalizeOrganizationCharge(org.Id, receipt.RequestId, 120, false))
	require.NoError(t, SetOrganizationMemberMonthlyLimits(org.Id, users[0].Id, []int{uid}, 130))
	// Existing spending counts even when it predates enabling the cap.
	_, err = ReserveOrganizationCharge(org.Id, uid, 0, "over-month", 11)
	assert.ErrorIs(t, err, ErrMemberSpendLimit)
	_, err = ReserveOrganizationCharge(org.Id, uid, 0, "remaining-month", 10)
	require.NoError(t, err)
	// Resetting a subscription/organization period cannot reset the monthly allowance.
	require.NoError(t, db.Model(org).Updates(map[string]interface{}{"budget_period_start": 42, "budget_period_end": time.Now().Add(time.Hour).Unix()}).Error)
	_, err = ReserveOrganizationCharge(org.Id, uid, 0, "new-period", 1)
	assert.ErrorIs(t, err, ErrMemberSpendLimit)
	require.NoError(t, FinalizeOrganizationCharge(org.Id, "remaining-month", 0, true))
	_, err = ReserveOrganizationCharge(org.Id, uid, 0, "refund-releases", 10)
	require.NoError(t, err)
	require.NoError(t, SetOrganizationMemberMonthlyLimits(org.Id, users[0].Id, []int{uid}, 0))
	_, err = ReserveOrganizationCharge(org.Id, uid, 0, "disabled-month", 200)
	require.NoError(t, err)
	// The original per-period cap still works independently.
	require.NoError(t, SetOrganizationMemberBudget(org.Id, users[0].Id, uid, 210))
	_, err = ReserveOrganizationCharge(org.Id, uid, 0, "old-budget", 1)
	assert.ErrorIs(t, err, ErrMemberSpendLimit)
}

func TestOrganizationMemberEditMonthlyLimitIsAtomicAndOptional(t *testing.T) {
	db, org, users := organizationBillingFixture(t)
	uid := users[1].Id
	limit := int64(120)
	require.NoError(t, UpdateOrganizationMember(org.Id, users[0].Id, uid, OrgRoleMember, OrganizationActive, 0, &limit))
	require.NoError(t, UpdateOrganizationMember(org.Id, users[0].Id, uid, OrgRoleMember, OrganizationActive, 0))
	var member OrganizationMember
	require.NoError(t, db.Where("org_id = ? AND user_id = ?", org.Id, uid).First(&member).Error)
	assert.Equal(t, limit, member.MonthlySpendLimit)
	_, err := ReserveOrganizationCharge(org.Id, uid, 0, "edited-limit-denies", 121)
	assert.ErrorIs(t, err, ErrMemberSpendLimit)
	invalid := int64(-1)
	assert.ErrorIs(t, UpdateOrganizationMember(org.Id, users[0].Id, uid, OrgRoleAdmin, OrganizationDisabled, 100, &invalid), ErrOrganizationInput)
	var unchanged OrganizationMember
	require.NoError(t, db.First(&unchanged, member.Id).Error)
	assert.Equal(t, member, unchanged)
	limit = 0
	require.NoError(t, UpdateOrganizationMember(org.Id, users[0].Id, uid, OrgRoleMember, OrganizationActive, 0, &limit))
	_, err = ReserveOrganizationCharge(org.Id, uid, 0, "cleared-limit-allows", 121)
	require.NoError(t, err)
}

func TestOrganizationMemberBudgetEditsBothLimitsAtomically(t *testing.T) {
	db, org, users := organizationBillingFixture(t)
	owner := users[0].Id
	monthly := int64(200)
	require.NoError(t, SetOrganizationMemberBudget(org.Id, owner, owner, 100, &monthly))
	require.NoError(t, SetOrganizationMemberBudget(org.Id, owner, owner, 150))
	var member OrganizationMember
	require.NoError(t, db.Where("org_id = ? AND user_id = ?", org.Id, owner).First(&member).Error)
	assert.Equal(t, int64(150), member.SpendLimit)
	assert.Equal(t, monthly, member.MonthlySpendLimit)
	invalid := int64(-1)
	assert.ErrorIs(t, SetOrganizationMemberBudget(org.Id, owner, owner, 999, &invalid), ErrOrganizationInput)
	assert.Error(t, SetOrganizationMemberBudget(org.Id, users[1].Id, owner, 999, &monthly))
	var unchanged OrganizationMember
	require.NoError(t, db.First(&unchanged, member.Id).Error)
	assert.Equal(t, member, unchanged)
	monthly = 0
	require.NoError(t, SetOrganizationMemberBudget(org.Id, owner, owner, 0, &monthly))
	require.NoError(t, db.First(&member, member.Id).Error)
	assert.Zero(t, member.MonthlySpendLimit)
	assert.Zero(t, member.SpendLimit)
}

func TestOrganizationMonthlyLimitBatchIsAtomicAndAuthorized(t *testing.T) {
	db, org, users := organizationBillingFixture(t)
	ids := []int{users[0].Id, users[1].Id}
	assert.Error(t, SetOrganizationMemberMonthlyLimits(org.Id, users[1].Id, ids, 99))
	assert.Error(t, SetOrganizationMemberMonthlyLimits(org.Id, users[0].Id, []int{ids[0], 999999}, 99))
	for _, invalid := range [][]int{nil, {ids[0], ids[0]}, {-1}} {
		assert.ErrorIs(t, SetOrganizationMemberMonthlyLimits(org.Id, ids[0], invalid, 10), ErrOrganizationInput)
	}
	assert.ErrorIs(t, SetOrganizationMemberMonthlyLimits(org.Id, ids[0], ids, -1), ErrOrganizationInput)
	assert.ErrorIs(t, SetOrganizationMemberMonthlyLimits(org.Id, ids[0], ids, int64(common.MaxWalletQuota)+1), ErrOrganizationInput)
	var members []OrganizationMember
	require.NoError(t, db.Where("org_id = ?", org.Id).Order("user_id").Find(&members).Error)
	for _, member := range members {
		assert.Zero(t, member.MonthlySpendLimit)
	}
	require.NoError(t, SetOrganizationMemberMonthlyLimits(org.Id, ids[0], ids, 99))
	var updated []OrganizationMember
	require.NoError(t, db.Where("org_id = ?", org.Id).Order("user_id").Find(&updated).Error)
	for i := range members {
		members[i].MonthlySpendLimit = 99
	}
	assert.Equal(t, members, updated)
	var audits []OrganizationAudit
	require.NoError(t, db.Where("org_id = ? AND action = ?", org.Id, "member.monthly_limit").Find(&audits).Error)
	assert.Len(t, audits, 2)
}

func TestOrganizationMonthlyWindowAndCrossMonthRefund(t *testing.T) {
	boundary := time.Date(2026, 3, 1, 0, 0, 0, 0, time.FixedZone("UTC+8", 28800)).Unix()
	start, end := OrganizationMonthlyWindow(boundary)
	assert.Equal(t, boundary, start)
	assert.Equal(t, time.Date(2026, 4, 1, 0, 0, 0, 0, time.FixedZone("UTC+8", 28800)).Unix(), end)
	_, previousEnd := OrganizationMonthlyWindow(boundary - 1)
	assert.Equal(t, boundary, previousEnd)
	db, org, users := organizationBillingFixture(t)
	uid := users[1].Id
	require.NoError(t, SetOrganizationMemberMonthlyLimits(org.Id, users[0].Id, []int{uid}, 100))
	r, err := ReserveOrganizationCharge(org.Id, uid, 0, "old-month", 100)
	require.NoError(t, err)
	currentStart, _ := OrganizationMonthlyWindow(time.Now().Unix())
	require.NoError(t, db.Model(r).Update("created_at", currentStart-1).Error)
	_, err = ReserveOrganizationCharge(org.Id, uid, 0, "this-month", 100)
	require.NoError(t, err)
	require.NoError(t, FinalizeOrganizationCharge(org.Id, "old-month", 0, true))
	_, err = ReserveOrganizationCharge(org.Id, uid, 0, "no-credit-new-month", 1)
	assert.ErrorIs(t, err, ErrMemberSpendLimit)
	// Actual cost must still settle when an upstream estimate was low.
	require.NoError(t, FinalizeOrganizationCharge(org.Id, "this-month", 110, false))
	_, err = ReserveOrganizationCharge(org.Id, uid, 0, "after-overrun", 1)
	assert.ErrorIs(t, err, ErrMemberSpendLimit)
}

func TestOrganizationMonthlyLimitConcurrentReservations(t *testing.T) {
	db, org, users := organizationBillingFixture(t)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	if common.UsingMainDatabase(common.DatabaseTypeSQLite) {
		sqlDB.SetMaxOpenConns(1)
	}
	require.NoError(t, SetOrganizationMemberMonthlyLimits(org.Id, users[0].Id, []int{users[1].Id}, 100))
	start := make(chan struct{})
	results := make(chan error, 2)
	var wg sync.WaitGroup
	for _, id := range []string{"monthly-a", "monthly-b"} {
		wg.Add(1)
		go func(id string) {
			defer wg.Done()
			<-start
			_, err := ReserveOrganizationCharge(org.Id, users[1].Id, 0, id, 60)
			results <- err
		}(id)
	}
	close(start)
	wg.Wait()
	close(results)
	successes, denied := 0, 0
	for err := range results {
		if err == nil {
			successes++
		} else {
			assert.ErrorIs(t, err, ErrMemberSpendLimit)
			denied++
		}
	}
	assert.Equal(t, 1, successes)
	assert.Equal(t, 1, denied)
}

func TestOrganizationMonthlyLimitUpgradePreservesMembers(t *testing.T) {
	db, org, _ := organizationBillingFixture(t)
	var before []OrganizationMember
	require.NoError(t, db.Where("org_id = ?", org.Id).Order("id").Find(&before).Error)
	require.NoError(t, db.Migrator().DropColumn(&OrganizationMember{}, "monthly_spend_limit"))
	require.NoError(t, db.Migrator().DropIndex(&OrganizationCharge{}, "idx_org_charge_month"))
	for i := 0; i < 2; i++ {
		require.NoError(t, db.AutoMigrate(&OrganizationMember{}, &OrganizationCharge{}))
		var after []OrganizationMember
		require.NoError(t, db.Where("org_id = ?", org.Id).Order("id").Find(&after).Error)
		assert.Equal(t, before, after)
		assert.True(t, db.Migrator().HasIndex(&OrganizationMember{}, "idx_org_member"))
		assert.True(t, db.Migrator().HasIndex(&OrganizationCharge{}, "idx_org_charge_month"))
	}
}

func TestOrganizationMonthlyLimitCombinesWalletAndSubscription(t *testing.T) {
	db, org, users := organizationBillingFixture(t)
	uid := users[1].Id
	require.NoError(t, SetOrganizationMemberMonthlyLimits(org.Id, users[0].Id, []int{uid}, 150))
	_, err := ReserveOrganizationCharge(org.Id, uid, 0, "wallet-monthly", 50)
	require.NoError(t, err)
	require.NoError(t, FinalizeOrganizationCharge(org.Id, "wallet-monthly", 50, false))
	no := false
	plan := SubscriptionPlan{Title: "Daily team plan", Enabled: true, Audience: "org", DurationUnit: SubscriptionDurationMonth, DurationValue: 1, TotalAmount: 300, QuotaResetPeriod: SubscriptionResetDaily, MaxMembers: 2, AllowWalletOverflow: &no}
	require.NoError(t, db.Create(&plan).Error)
	var sub *UserSubscription
	require.NoError(t, db.Transaction(func(tx *gorm.DB) error {
		var err error
		sub, err = CreateOrganizationSubscriptionFromPlanTx(tx, org.Id, users[0].Id, &plan, "order")
		return err
	}))
	receipt, err := ReserveOrganizationCharge(org.Id, uid, 0, "subscription-monthly", 100)
	require.NoError(t, err)
	assert.Equal(t, sub.Id, receipt.SubscriptionId)
	require.NoError(t, FinalizeOrganizationCharge(org.Id, receipt.RequestId, 100, false))
	require.NoError(t, db.Model(sub).Updates(map[string]interface{}{"last_reset_time": sub.LastResetTime + 86400, "amount_used": 0}).Error)
	_, err = ReserveOrganizationCharge(org.Id, uid, 0, "after-daily-reset", 1)
	assert.ErrorIs(t, err, ErrMemberSpendLimit)
	require.NoError(t, db.First(sub, sub.Id).Error)
	assert.Zero(t, sub.AmountUsed)
	require.NoError(t, db.First(org, org.Id).Error)
	assert.Equal(t, int64(950), org.Quota)
}
