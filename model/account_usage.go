package model

import "gorm.io/gorm"

// BackfillOrganizationUserUsage separates organization traffic from the existing
// durable user totals. NULL marks users not yet migrated. Once populated, these
// counters are maintained with user usage, independently of log retention.
// Run before serving requests, after both main and log migrations have finished.
func BackfillOrganizationUserUsage() error {
	var users []User
	return DB.Unscoped().Select("id").Where("org_used_quota IS NULL").FindInBatches(&users, 500, func(_ *gorm.DB, _ int) error {
		for _, user := range users {
			var usage struct {
				Quota int64
			}
			if err := LOG_DB.Model(&Log{}).Where("user_id = ? AND org_id > 0 AND type IN ?", user.Id, []int{LogTypeConsume, LogTypeRefund}).
				Select("COALESCE(SUM(CASE WHEN type = ? THEN quota ELSE -quota END), 0) AS quota", LogTypeConsume).Scan(&usage).Error; err != nil {
				return err
			}
			if err := DB.Unscoped().Model(&User{}).Where("id = ? AND (org_used_quota IS NULL)", user.Id).
				Updates(map[string]interface{}{"org_used_quota": usage.Quota}).Error; err != nil {
				return err
			}
		}
		return nil
	}).Error
}
