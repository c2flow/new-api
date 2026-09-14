package model

import (
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

// AdjustOrganizationQuota serializes manual adjustments with organization
// settlement and persists the audit in the same transaction as the balance.
func AdjustOrganizationQuota(orgID, actorID int, mode string, value int64, reason string) (int64, error) {
	reason = strings.TrimSpace(reason)
	limit := int64(common.MaxWalletQuota)
	if orgID <= 0 || actorID <= 0 || reason == "" || len(reason) > 256 || value < -limit || value > limit || (mode != "add" && mode != "subtract" && mode != "override") || (mode != "override" && value <= 0) {
		return 0, ErrOrganizationInput
	}
	var balance int64
	err := DB.Transaction(func(tx *gorm.DB) error {
		var org Organization
		if err := lockForUpdate(tx).Where("id = ? AND status IN ?", orgID, []int{OrganizationActive, OrganizationDisabled, OrganizationSuspended}).First(&org).Error; err != nil {
			return ErrOrganizationAccess
		}
		balance = value
		switch mode {
		case "add":
			if org.Quota > limit-value {
				return ErrOrganizationInput
			}
			balance = org.Quota + value
		case "subtract":
			if org.Quota < -limit+value {
				return ErrOrganizationInput
			}
			balance = org.Quota - value
		}
		before := org.Quota
		if err := tx.Model(&org).Update("quota", balance).Error; err != nil {
			return err
		}
		return tx.Create(&OrganizationAudit{OrgId: orgID, ActorId: actorID, Action: "platform.quota_" + mode, ObjectId: fmt.Sprint(orgID), Result: "success", Reason: fmt.Sprintf("%s\nquota: %d -> %d (value: %d)", reason, before, balance, value)}).Error
	})
	return balance, err
}
