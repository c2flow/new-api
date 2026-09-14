package model

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestAccountUsageBackfillAndRefundsSurviveLogCleanup(t *testing.T) {
	for _, batch := range []bool{false, true} {
		t.Run(map[bool]string{false: "direct", true: "batch"}[batch], func(t *testing.T) {
			db := organizationTestDatabase(t)
			resetBatchUpdateTestState(t)
			oldBatch := common.BatchUpdateEnabled
			common.BatchUpdateEnabled = batch
			t.Cleanup(func() { common.BatchUpdateEnabled = oldBatch })
			// The durable total retains personal usage whose logs have already expired.
			users := []User{{Username: "legacy-mixed", AffCode: "mixed", UsedQuota: 1300, RequestCount: 11}, {Username: "legacy-personal", AffCode: "personal", UsedQuota: 700, RequestCount: 9}}
			require.NoError(t, db.Create(&users).Error)
			require.NoError(t, db.Create(&[]Log{
				{UserId: users[0].Id, OrgId: 7, Type: LogTypeConsume, Quota: 500},
				{UserId: users[0].Id, OrgId: 7, Type: LogTypeRefund, Quota: 200},
				{UserId: users[0].Id, Type: LogTypeConsume, Quota: 100},
				{UserId: users[0].Id, Type: LogTypeRefund, Quota: 100},
			}).Error)
			require.NoError(t, BackfillOrganizationUserUsage())
			require.NoError(t, db.First(&users[0], users[0].Id).Error)
			require.NotNil(t, users[0].OrgUsedQuota)
			assert.Equal(t, int64(300), *users[0].OrgUsedQuota)
			assert.Equal(t, int64(1000), int64(users[0].UsedQuota)-*users[0].OrgUsedQuota)
			require.NoError(t, db.First(&users[1], users[1].Id).Error)
			require.NotNil(t, users[1].OrgUsedQuota)
			assert.Zero(t, *users[1].OrgUsedQuota)
			assert.Equal(t, 700, users[1].UsedQuota)
			require.NoError(t, db.Where("1 = 1").Delete(&Log{}).Error)
			require.NoError(t, BackfillOrganizationUserUsage())
			UpdateUserUsedQuotaAndRequestCount(users[0].Id, 100)
			UpdateUserUsedQuota(users[0].Id, -100)
			UpdateUserUsedQuotaAndRequestCount(users[0].Id, 200, 7)
			UpdateUserUsedQuota(users[0].Id, -50, 7)
			if batch {
				batchUpdate()
			}
			require.NoError(t, db.First(&users[0], users[0].Id).Error)
			assert.Equal(t, int64(450), *users[0].OrgUsedQuota)
			assert.Equal(t, int64(1000), int64(users[0].UsedQuota)-*users[0].OrgUsedQuota)
		})
	}
}
