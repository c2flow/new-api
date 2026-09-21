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

// PlatformSetOrganizationGroup changes the routing and pricing group inherited
// by every API key owned by the organization. The caller validates that the
// group is currently configured by the platform.
func PlatformSetOrganizationGroup(orgID, actorID int, group string) error {
	group = strings.TrimSpace(group)
	if orgID <= 0 || actorID <= 0 || group == "" || utf8.RuneCountInString(group) > 64 {
		return ErrOrganizationInput
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		var org Organization
		if err := lockForUpdate(tx).Where("id = ?", orgID).First(&org).Error; err != nil {
			return ErrOrganizationAccess
		}
		if org.Group == group {
			return nil
		}
		if err := tx.Model(&org).Update("group", group).Error; err != nil {
			return err
		}
		return tx.Create(&OrganizationAudit{OrgId: orgID, ActorId: actorID, Action: "platform.group", ObjectId: group, Result: "success"}).Error
	})
}
