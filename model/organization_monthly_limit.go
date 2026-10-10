package model

import (
	"fmt"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

// OrganizationMonthlyWindow defines the UTC+8 calendar month used by member
// spending limits and organization wallet usage.
func OrganizationMonthlyWindow(timestamp int64) (int64, int64) {
	date := time.Unix(timestamp, 0).In(time.FixedZone("UTC+8", 8*60*60))
	start := time.Date(date.Year(), date.Month(), 1, 0, 0, 0, 0, date.Location())
	return start.Unix(), start.AddDate(0, 1, 0).Unix()
}

// SetOrganizationMemberLimits patches supplied limits. NULL removes a cap; zero blocks spending.
func SetOrganizationMemberLimits(orgID, actorID int, userIDs []int, limits map[string]*int64) error {
	if len(userIDs) == 0 || len(userIDs) > 500 || len(limits) == 0 {
		return ErrOrganizationInput
	}
	updates := make(map[string]interface{}, len(limits))
	for field, value := range limits {
		if field != "spend_limit" && field != "monthly_spend_limit" {
			return ErrOrganizationInput
		}
		if value != nil && (*value < 0 || *value > int64(common.MaxWalletQuota)) {
			return ErrOrganizationInput
		}
		updates[field] = value
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
			if monthly, present := limits["monthly_spend_limit"]; present {
				audit.Reason = fmt.Sprintf("monthly_spend_limit: %s -> %s", formatOrganizationSpendLimit(member.MonthlySpendLimit), formatOrganizationSpendLimit(monthly))
			}
			if total, present := limits["spend_limit"]; present {
				audit.Action = "member.limits"
				audit.Reason += fmt.Sprintf(" spend_limit: %s -> %s", formatOrganizationSpendLimit(member.SpendLimit), formatOrganizationSpendLimit(total))
			}
			if err := tx.Create(&audit).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func formatOrganizationSpendLimit(limit *int64) string {
	if limit == nil {
		return "unlimited"
	}
	return strconv.FormatInt(*limit, 10)
}
