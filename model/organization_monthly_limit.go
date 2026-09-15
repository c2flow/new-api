package model

import (
	"fmt"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

// OrganizationMonthlyWindow is independent of wallet and subscription periods.
func OrganizationMonthlyWindow(timestamp int64) (int64, int64) {
	date := time.Unix(timestamp, 0).In(time.FixedZone("UTC+8", 8*60*60))
	start := time.Date(date.Year(), date.Month(), 1, 0, 0, 0, 0, date.Location())
	return start.Unix(), start.AddDate(0, 1, 0).Unix()
}

// SetOrganizationMemberMonthlyLimits atomically overrides only the optional monthly cap.
// Zero disables the cap; total caps and roles are never changed.
func SetOrganizationMemberMonthlyLimits(orgID, actorID int, userIDs []int, limit int64) error {
	return SetOrganizationMemberLimits(orgID, actorID, userIDs, nil, &limit)
}

// SetOrganizationMemberLimits patches only supplied limits. Zero removes a limit.
func SetOrganizationMemberLimits(orgID, actorID int, userIDs []int, total, monthly *int64) error {
	if len(userIDs) == 0 || len(userIDs) > 500 || (total == nil && monthly == nil) {
		return ErrOrganizationInput
	}
	updates := make(map[string]interface{}, 2)
	for field, value := range map[string]*int64{"spend_limit": total, "monthly_spend_limit": monthly} {
		if value == nil {
			continue
		}
		if *value < 0 || *value > int64(common.MaxWalletQuota) {
			return ErrOrganizationInput
		}
		updates[field] = *value
	}
	seen := make(map[int]bool, len(userIDs))
	for _, id := range userIDs {
		if id <= 0 || seen[id] {
			return ErrOrganizationInput
		}
		seen[id] = true
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		if _, err := lockOrganizationManager(tx, orgID, actorID, false); err != nil {
			return err
		}
		var members []OrganizationMember
		if err := tx.Scopes(OrgScope(orgID)).Where("user_id IN ? AND status = ?", userIDs, OrganizationActive).Find(&members).Error; err != nil {
			return err
		}
		if len(members) != len(userIDs) {
			return ErrOrganizationAccess
		}
		if err := tx.Model(&OrganizationMember{}).Scopes(OrgScope(orgID)).Where("user_id IN ?", userIDs).Updates(updates).Error; err != nil {
			return err
		}
		for _, member := range members {
			audit := OrganizationAudit{OrgId: orgID, ActorId: actorID, Action: "member.monthly_limit", ObjectId: fmt.Sprint(member.UserId), Result: "success"}
			if monthly != nil {
				audit.Reason = fmt.Sprintf("monthly_spend_limit: %d -> %d", member.MonthlySpendLimit, *monthly)
			}
			if total != nil {
				audit.Action = "member.limits"
				audit.Reason += fmt.Sprintf(" spend_limit: %d -> %d", member.SpendLimit, *total)
			}
			if err := tx.Create(&audit).Error; err != nil {
				return err
			}
		}
		return nil
	})
}
