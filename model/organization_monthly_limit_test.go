package model

import (
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestOrganizationMonthlyLimitIsOptionalAndIndependent(t *testing.T) {
	db, org, users := organizationBillingFixture(t)
	uid := users[1].Id
	require.NoError(t, db.Model(&OrganizationMember{}).Where("org_id = ? AND user_id = ?", org.Id, uid).Update("spend_limit", nil).Error)
	receipt, err := ReserveOrganizationCharge(org.Id, uid, 0, "before-enabled", 150)
	require.NoError(t, err)
	require.NoError(t, FinalizeOrganizationCharge(org.Id, receipt.RequestId, 120, false))
	require.NoError(t, setMonthlyLimitForTest(org.Id, users[0].Id, []int{uid}, 130))
	// Existing spending counts even when it predates enabling the cap.
	_, err = ReserveOrganizationCharge(org.Id, uid, 0, "over-month", 11)
	assert.ErrorIs(t, err, ErrMemberSpendLimit)
	_, err = ReserveOrganizationCharge(org.Id, uid, 0, "remaining-month", 10)
	require.NoError(t, err)
	// Resetting the organization accounting period cannot reset the monthly allowance.
	require.NoError(t, db.Model(org).Updates(map[string]interface{}{"budget_period_start": 42, "budget_period_end": time.Now().Add(time.Hour).Unix()}).Error)
	_, err = ReserveOrganizationCharge(org.Id, uid, 0, "new-period", 1)
	assert.ErrorIs(t, err, ErrMemberSpendLimit)
	require.NoError(t, FinalizeOrganizationCharge(org.Id, "remaining-month", 0, true))
	_, err = ReserveOrganizationCharge(org.Id, uid, 0, "refund-releases", 10)
	require.NoError(t, err)
	require.NoError(t, setMonthlyLimitForTest(org.Id, users[0].Id, []int{uid}, 0))
	_, err = ReserveOrganizationCharge(org.Id, uid, 0, "disabled-month", 1)
	assert.ErrorIs(t, err, ErrMemberSpendLimit)
	require.NoError(t, SetOrganizationMemberLimits(org.Id, users[0].Id, []int{uid}, map[string]*int64{"monthly_spend_limit": nil}))
	_, err = ReserveOrganizationCharge(org.Id, uid, 0, "unlimited-month", 80)
	require.NoError(t, err)
	// The total cap still works independently.
	total := int64(210)
	require.NoError(t, SetOrganizationMemberLimits(org.Id, users[0].Id, []int{uid}, map[string]*int64{"spend_limit": &total}))
	_, err = ReserveOrganizationCharge(org.Id, uid, 0, "old-budget", 1)
	assert.ErrorIs(t, err, ErrMemberSpendLimit)
}

func TestOrganizationTotalLimitSurvivesPeriodsAndMonths(t *testing.T) {
	db, org, users := organizationBillingFixture(t)
	uid := users[1].Id
	month, _ := OrganizationMonthlyWindow(common.GetTimestamp())
	charge, err := ReserveOrganizationCharge(org.Id, uid, 0, "historic-total", 120)
	require.NoError(t, err)
	require.NoError(t, FinalizeOrganizationCharge(org.Id, charge.RequestId, 120, false))
	// Changing both the budget period and month must not release total allowance.
	require.NoError(t, db.Model(charge).Updates(map[string]interface{}{"period_start": 1, "created_at": month - 1}).Error)
	require.NoError(t, db.Model(org).Updates(map[string]interface{}{"budget_period_start": 2, "budget_period_end": common.GetTimestamp() + 3600}).Error)
	require.NoError(t, setMonthlyLimitForTest(org.Id, users[0].Id, []int{uid}, 100))
	_, err = ReserveOrganizationCharge(org.Id, uid, 0, "above-total", 81)
	assert.ErrorIs(t, err, ErrMemberSpendLimit)
	current, err := ReserveOrganizationCharge(org.Id, uid, 0, "remaining-total", 80)
	require.NoError(t, err)
	_, err = ReserveOrganizationCharge(org.Id, uid, 0, "reserved-counts", 1)
	assert.ErrorIs(t, err, ErrMemberSpendLimit)
	require.NoError(t, FinalizeOrganizationCharge(org.Id, current.RequestId, 0, true))
	_, err = ReserveOrganizationCharge(org.Id, uid, 0, "refund-releases-total", 80)
	require.NoError(t, err)
}

func TestOrganizationExplicitZeroTotalLimitBlocksSpending(t *testing.T) {
	_, org, users := organizationBillingFixture(t)
	zero := int64(0)
	require.NoError(t, SetOrganizationMemberLimits(org.Id, users[0].Id, []int{users[1].Id}, map[string]*int64{"spend_limit": &zero}))

	_, err := ReserveOrganizationCharge(org.Id, users[1].Id, 0, "zero-total-limit", 1)
	assert.ErrorIs(t, err, ErrMemberSpendLimit)
}

func TestOrganizationLimitsPatchIsAtomicAndPreservesOmittedFields(t *testing.T) {
	db, org, users := organizationBillingFixture(t)
	ids := []int{users[0].Id, users[1].Id}
	total, monthly := int64(300), int64(100)
	require.NoError(t, SetOrganizationMemberLimits(org.Id, ids[0], ids, map[string]*int64{"spend_limit": &total, "monthly_spend_limit": &monthly}))
	total = 400
	require.NoError(t, SetOrganizationMemberLimits(org.Id, ids[0], ids, map[string]*int64{"spend_limit": &total}))
	var before []OrganizationMember
	require.NoError(t, db.Where("org_id = ?", org.Id).Order("id").Find(&before).Error)
	for _, member := range before {
		assert.Equal(t, common.GetPointer(total), member.SpendLimit)
		assert.Equal(t, common.GetPointer(monthly), member.MonthlySpendLimit)
	}
	invalid := int64(-1)
	assert.ErrorIs(t, SetOrganizationMemberLimits(org.Id, ids[0], ids, map[string]*int64{"spend_limit": &total, "monthly_spend_limit": &invalid}), ErrOrganizationInput)
	assert.ErrorIs(t, SetOrganizationMemberLimits(org.Id, ids[0], ids, nil), ErrOrganizationInput)
	assert.Error(t, SetOrganizationMemberLimits(org.Id, ids[1], ids, map[string]*int64{"spend_limit": &total}))
	assert.Error(t, SetOrganizationMemberLimits(org.Id, ids[0], []int{ids[0], 999999}, map[string]*int64{"spend_limit": &total}))
	var after []OrganizationMember
	require.NoError(t, db.Where("org_id = ?", org.Id).Order("id").Find(&after).Error)
	assert.Equal(t, before, after)
	monthly = 0
	require.NoError(t, SetOrganizationMemberLimits(org.Id, ids[0], ids, map[string]*int64{"monthly_spend_limit": &monthly}))
	require.NoError(t, db.Where("org_id = ?", org.Id).Order("id").Find(&after).Error)
	for _, member := range after {
		assert.Equal(t, common.GetPointer(total), member.SpendLimit)
		assert.Equal(t, common.GetPointer(int64(0)), member.MonthlySpendLimit)
	}
}

func TestOrganizationMonthlyLimitBatchIsAtomicAndAuthorized(t *testing.T) {
	db, org, users := organizationBillingFixture(t)
	ids := []int{users[0].Id, users[1].Id}
	assert.Error(t, setMonthlyLimitForTest(org.Id, users[1].Id, ids, 99))
	assert.Error(t, setMonthlyLimitForTest(org.Id, users[0].Id, []int{ids[0], 999999}, 99))
	for _, invalid := range [][]int{nil, {ids[0], ids[0]}, {-1}} {
		assert.ErrorIs(t, setMonthlyLimitForTest(org.Id, ids[0], invalid, 10), ErrOrganizationInput)
	}
	assert.ErrorIs(t, setMonthlyLimitForTest(org.Id, ids[0], ids, -1), ErrOrganizationInput)
	assert.ErrorIs(t, setMonthlyLimitForTest(org.Id, ids[0], ids, int64(common.MaxWalletQuota)+1), ErrOrganizationInput)
	var members []OrganizationMember
	require.NoError(t, db.Where("org_id = ?", org.Id).Order("user_id").Find(&members).Error)
	for _, member := range members {
		assert.Nil(t, member.MonthlySpendLimit)
	}
	require.NoError(t, setMonthlyLimitForTest(org.Id, ids[0], ids, 99))
	var updated []OrganizationMember
	require.NoError(t, db.Where("org_id = ?", org.Id).Order("user_id").Find(&updated).Error)
	for i := range members {
		members[i].MonthlySpendLimit = common.GetPointer(int64(99))
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
	require.NoError(t, setMonthlyLimitForTest(org.Id, users[0].Id, []int{uid}, 100))
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
	require.NoError(t, setMonthlyLimitForTest(org.Id, users[0].Id, []int{users[1].Id}, 100))
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

// The old schema fixture exercises removing NOT NULL and retaining member identity.
type legacyOrganizationMember struct {
	Id                       int
	OrgId                    int    `gorm:"uniqueIndex:idx_org_member,priority:1;not null"`
	UserId                   int    `gorm:"uniqueIndex:idx_org_member,priority:2;index;not null"`
	Role                     string `gorm:"type:varchar(16);not null"`
	SpendLimit               int64  `gorm:"type:bigint;not null"`
	MonthlySpendLimit        int64  `gorm:"type:bigint"`
	SpendLimitEnabled        bool
	MonthlySpendLimitEnabled bool
	Status                   int `gorm:"not null"`
	CreatedAt                int64
}

func TestOrganizationNullableLimitSchemaUpgradePreservesMembers(t *testing.T) {
	db, org, _ := organizationBillingFixture(t)
	var before []OrganizationMember
	require.NoError(t, db.Where("org_id = ?", org.Id).Order("id").Find(&before).Error)
	require.NoError(t, db.Migrator().DropTable(&OrganizationMember{}))
	require.NoError(t, db.Table("organization_members").AutoMigrate(&legacyOrganizationMember{}))
	for _, member := range before {
		amount := int64(0)
		if member.SpendLimit != nil {
			amount = *member.SpendLimit
		}
		require.NoError(t, db.Table("organization_members").Create(&legacyOrganizationMember{Id: member.Id, OrgId: member.OrgId, UserId: member.UserId, Role: member.Role, Status: member.Status, SpendLimit: amount, CreatedAt: member.CreatedAt}).Error)
	}
	// Schema nullability is changed explicitly during deployment.
	require.NoError(t, db.Migrator().AlterColumn(&OrganizationMember{}, "SpendLimit"))
	for i := 0; i < 2; i++ {
		require.NoError(t, db.AutoMigrate(&OrganizationMember{}))
		if i == 0 {
			// Deployment explicitly converts legacy unlimited values; startup never does.
			require.NoError(t, db.Model(&OrganizationMember{}).Where("spend_limit = 0").Update("spend_limit", nil).Error)
			require.NoError(t, db.Model(&OrganizationMember{}).Where("monthly_spend_limit = 0").Update("monthly_spend_limit", nil).Error)
		}
		var after []OrganizationMember
		require.NoError(t, db.Where("org_id = ?", org.Id).Order("id").Find(&after).Error)
		assert.Equal(t, before, after)
		assert.True(t, db.Migrator().HasIndex(&OrganizationMember{}, "idx_org_member"))
	}
	duplicate := OrganizationMember{OrgId: before[0].OrgId, UserId: before[0].UserId, Role: OrgRoleMember, Status: OrganizationActive}
	assert.Error(t, db.Create(&duplicate).Error)
	// A real zero must survive every subsequent startup.
	require.NoError(t, db.Model(&OrganizationMember{}).Where("id = ?", before[0].Id).Update("spend_limit", 0).Error)
	require.NoError(t, db.AutoMigrate(&OrganizationMember{}))
	var zero OrganizationMember
	require.NoError(t, db.First(&zero, before[0].Id).Error)
	assert.Equal(t, common.GetPointer(int64(0)), zero.SpendLimit)
}

func TestOrganizationNullableLimitsEnforceZeroAndRemoveCaps(t *testing.T) {
	for _, field := range []string{"spend_limit", "monthly_spend_limit"} {
		t.Run(field, func(t *testing.T) {
			db, org, users := organizationBillingFixture(t)
			ids := []int{users[1].Id}
			require.NoError(t, SetOrganizationMemberLimits(org.Id, users[0].Id, ids, map[string]*int64{"spend_limit": nil, "monthly_spend_limit": nil}))
			zero := int64(0)
			require.NoError(t, SetOrganizationMemberLimits(org.Id, users[0].Id, ids, map[string]*int64{field: &zero}))
			_, err := ReserveOrganizationCharge(org.Id, ids[0], 0, "blocked-zero", 1)
			assert.ErrorIs(t, err, ErrMemberSpendLimit)
			_, err = ReserveOrganizationCharge(org.Id, ids[0], 0, "blocked-zero-estimate", 0)
			assert.ErrorIs(t, err, ErrMemberSpendLimit)
			require.NoError(t, SetOrganizationMemberLimits(org.Id, users[0].Id, ids, map[string]*int64{field: nil}))
			_, err = ReserveOrganizationCharge(org.Id, ids[0], 0, "removed-cap", 250)
			require.NoError(t, err)
			var member OrganizationMember
			require.NoError(t, db.Where("org_id = ? AND user_id = ?", org.Id, ids[0]).First(&member).Error)
			assert.Nil(t, member.SpendLimit)
			assert.Nil(t, member.MonthlySpendLimit)
			data, err := common.Marshal(member)
			require.NoError(t, err)
			assert.Contains(t, string(data), `"spend_limit":null`)
			assert.Contains(t, string(data), `"monthly_spend_limit":null`)
		})
	}
}

func setMonthlyLimitForTest(orgID, actorID int, userIDs []int, limit int64) error {
	return SetOrganizationMemberLimits(orgID, actorID, userIDs, map[string]*int64{"monthly_spend_limit": &limit})
}

func TestOrganizationDefaultMemberLimitPreservesNullAndZero(t *testing.T) {
	for _, test := range []struct {
		name  string
		limit *int64
	}{
		{"unlimited", nil},
		{"blocked", common.GetPointer(int64(0))},
		{"capped", common.GetPointer(int64(100))},
	} {
		t.Run(test.name, func(t *testing.T) {
			db := organizationTestDatabase(t)
			users := []User{{Username: "owner", AffCode: "owner", Status: common.UserStatusEnabled}, {Username: "member", AffCode: "member", Status: common.UserStatusEnabled}}
			require.NoError(t, db.Create(&users).Error)
			org, err := CreateTeamOrganization(users[0].Id, "Default limits")
			require.NoError(t, err)
			require.NoError(t, UpdateOrganizationSettings(org.Id, users[0].Id, org.Name, OrganizationSettings{DefaultSpendLimit: test.limit}))
			invite, err := CreateOrganizationInvite(org.Id, users[0].Id, users[1].Username, OrgRoleMember)
			require.NoError(t, err)
			_, err = AcceptOrganizationInvite(users[1].Id, invite.Id)
			require.NoError(t, err)
			_, member, err := GetOrganizationMembership(org.Id, users[1].Id)
			require.NoError(t, err)
			assert.Equal(t, test.limit, member.SpendLimit)
			assert.Nil(t, member.MonthlySpendLimit)
		})
	}
}
