package model

import (
	"errors"
	"fmt"
	"strings"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

type PlatformOrganizationMemberInput struct {
	Username          string
	Role              string
	SpendLimit        *int64
	MonthlySpendLimit *int64
	Reason            string
}

func PlatformAddOrganizationMember(orgID, actorID int, input PlatformOrganizationMemberInput) (*OrganizationMember, error) {
	input.Username = strings.TrimSpace(input.Username)
	input.Reason = strings.TrimSpace(input.Reason)
	if orgID <= 0 || actorID <= 0 || input.Username == "" || utf8.RuneCountInString(input.Username) > 20 ||
		(input.Role != OrgRoleAdmin && input.Role != OrgRoleMember) || input.Reason == "" || utf8.RuneCountInString(input.Reason) > 256 ||
		(input.SpendLimit != nil && (*input.SpendLimit < 0 || *input.SpendLimit > int64(common.MaxWalletQuota))) ||
		(input.MonthlySpendLimit != nil && (*input.MonthlySpendLimit < 0 || *input.MonthlySpendLimit > int64(common.MaxWalletQuota))) {
		return nil, ErrOrganizationInput
	}
	member := OrganizationMember{}
	err := DB.Transaction(func(tx *gorm.DB) error {
		var org Organization
		if err := lockForUpdate(tx).Where("id = ? AND status = ?", orgID, OrganizationActive).First(&org).Error; err != nil {
			return ErrOrganizationAccess
		}
		var target User
		if err := tx.Where("username = ? AND status = ?", input.Username, common.UserStatusEnabled).First(&target).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrOrganizationInviteUser
			}
			return err
		}
		if target.Username != input.Username {
			return ErrOrganizationInviteUser
		}
		err := tx.Scopes(OrgScope(orgID)).Where("user_id = ?", target.Id).First(&member).Error
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		if member.Id != 0 && member.Status == OrganizationActive {
			return ErrOrganizationMemberExists
		}
		member.OrgId = orgID
		member.UserId = target.Id
		member.Role = input.Role
		member.Status = OrganizationActive
		member.SpendLimit = input.SpendLimit
		member.MonthlySpendLimit = input.MonthlySpendLimit
		if err := tx.Save(&member).Error; err != nil {
			return err
		}
		if err := tx.Model(&OrganizationInvite{}).Scopes(OrgScope(orgID)).Where("invitee_id = ? AND status = ?", target.Id, "pending").Update("status", "superseded").Error; err != nil {
			return err
		}
		return tx.Create(&OrganizationAudit{
			OrgId: orgID, ActorId: actorID, Action: "platform.member_add", ObjectId: fmt.Sprint(target.Id), Result: "success",
			Reason: fmt.Sprintf("%s\nrole: %s; spend_limit: %s; monthly_spend_limit: %s", input.Reason, input.Role, formatOrganizationSpendLimit(input.SpendLimit), formatOrganizationSpendLimit(input.MonthlySpendLimit)),
		}).Error
	})
	return &member, err
}

func PlatformUpdateOrganizationMember(orgID, actorID, userID int, role string, status int, total, monthly *int64, reason string) error {
	reason = strings.TrimSpace(reason)
	if orgID <= 0 || actorID <= 0 || userID <= 0 || (role != OrgRoleAdmin && role != OrgRoleMember) ||
		(status != OrganizationActive && status != OrganizationDisabled && status != OrganizationDeleting) || reason == "" || utf8.RuneCountInString(reason) > 256 ||
		(total != nil && (*total < 0 || *total > int64(common.MaxWalletQuota))) || (monthly != nil && (*monthly < 0 || *monthly > int64(common.MaxWalletQuota))) {
		return ErrOrganizationInput
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		var org Organization
		if err := lockForUpdate(tx).Where("id = ? AND status = ?", orgID, OrganizationActive).First(&org).Error; err != nil {
			return ErrOrganizationAccess
		}
		var member OrganizationMember
		if err := tx.Scopes(OrgScope(orgID)).Where("user_id = ?", userID).First(&member).Error; err != nil {
			return ErrOrganizationAccess
		}
		if member.Role == OrgRoleOwner {
			return ErrOrganizationOwner
		}
		if status != OrganizationActive {
			if err := DisableOrganizationMemberTokensTx(tx, orgID, userID); err != nil {
				return err
			}
		}
		before := fmt.Sprintf("role: %s; status: %d; spend_limit: %s; monthly_spend_limit: %s", member.Role, member.Status, formatOrganizationSpendLimit(member.SpendLimit), formatOrganizationSpendLimit(member.MonthlySpendLimit))
		updates := map[string]interface{}{"role": role, "status": status, "spend_limit": total, "monthly_spend_limit": monthly}
		if err := tx.Model(&member).Updates(updates).Error; err != nil {
			return err
		}
		return tx.Create(&OrganizationAudit{
			OrgId: orgID, ActorId: actorID, Action: "platform.member_update", ObjectId: fmt.Sprint(userID), Result: "success",
			Reason: fmt.Sprintf("%s\n%s -> role: %s; status: %d; spend_limit: %s; monthly_spend_limit: %s", reason, before, role, status, formatOrganizationSpendLimit(total), formatOrganizationSpendLimit(monthly)),
		}).Error
	})
}

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
