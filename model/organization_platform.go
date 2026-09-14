package model

import (
	"fmt"
	"gorm.io/gorm"
	"strings"
	"unicode/utf8"
)

func PlatformChangeOrganizationStatusTx(tx *gorm.DB, orgID, actorID, status int, reason string) error {
	var org Organization
	if err := lockForUpdate(tx).Where("id = ?", orgID).First(&org).Error; err != nil {
		return ErrOrganizationAccess
	}
	if status != OrganizationActive && status != OrganizationDisabled {
		return ErrOrganizationInput
	}
	if status == OrganizationDisabled {
		status = OrganizationSuspended
	}
	org.Status = status
	if err := tx.Model(&org).Update("status", status).Error; err != nil {
		return err
	}
	return tx.Create(&OrganizationAudit{OrgId: orgID, ActorId: actorID, Action: "platform.status", ObjectId: fmt.Sprint(status), Result: "success", Reason: reason}).Error
}

// PlatformSetOrganizationRemark must be called behind platform write authorization.
func PlatformSetOrganizationRemark(orgID, actorID int, remark string) error {
	remark = strings.TrimSpace(remark)
	if orgID <= 0 || actorID <= 0 || utf8.RuneCountInString(remark) > 255 {
		return ErrOrganizationInput
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		var org Organization
		if err := lockForUpdate(tx).Where("id = ?", orgID).First(&org).Error; err != nil {
			return ErrOrganizationAccess
		}
		if err := tx.Model(&org).Update("remark", remark).Error; err != nil {
			return err
		}
		// Audit the action without exposing private note contents to organization members.
		return tx.Create(&OrganizationAudit{OrgId: orgID, ActorId: actorID, Action: "platform.remark", ObjectId: fmt.Sprint(orgID), Result: "success"}).Error
	})
}
