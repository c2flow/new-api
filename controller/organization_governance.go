package controller

import (
	"encoding/json"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/authz"
	"github.com/gin-gonic/gin"
)

func GetOrganizationSummary(c *gin.Context) {
	org, member, err := model.GetOrganizationMembership(c.GetInt("org_id"), c.GetInt("id"))
	if err != nil {
		organizationError(c, err)
		return
	}
	getOrganizationSummary(c, org, member)
}

func getOrganizationSummary(c *gin.Context, org *model.Organization, member *model.OrganizationMember) {
	usage, err := model.GetOrganizationMonthlyUsage(org.Id, common.GetTimestamp())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if !authz.CanOrg(member.UserId, org.Id, member.Role, authz.Permission{Resource: "org.usage", Action: "read_all"}) {
		var ownUsed int64
		if err := model.DB.Model(&model.OrganizationCharge{}).Scopes(model.OrgScope(org.Id)).Where("user_id = ? AND status = ?", member.UserId, "settled").Select("COALESCE(SUM(quota), 0)").Scan(&ownUsed).Error; err != nil {
			common.ApiError(c, err)
			return
		}
		org.UsedQuota = ownUsed
		own := make([]model.OrganizationBudgetUsage, 0, 1)
		for _, row := range usage {
			if row.UserId == member.UserId {
				own = append(own, row)
			}
		}
		usage = own
	}
	var memberCount, keyCount, requestCount int64
	usageScope := model.ResourceScope{
		OrgID:      org.Id,
		UserID:     member.UserId,
		AllMembers: authz.CanOrg(member.UserId, org.Id, member.Role, authz.Permission{Resource: "org.usage", Action: "read_all"}),
	}
	if err := usageScope.Apply(model.LOG_DB.Model(&model.Log{})).Where("type = ?", model.LogTypeConsume).Count(&requestCount).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.DB.Model(&model.OrganizationMember{}).Scopes(model.OrgScope(org.Id)).Where("status = ?", model.OrganizationActive).Count(&memberCount).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	if err := (model.TokenScope{OrgID: org.Id, UserID: member.UserId}).Apply(model.DB.Model(&model.Token{})).Count(&keyCount).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	available := max(int64(0), org.Quota)
	totalRemaining, monthlyRemaining := int64(0), int64(0)
	totalLimitEnabled := member.SpendLimit != nil
	monthlyLimitEnabled := member.MonthlySpendLimit != nil
	if totalLimitEnabled {
		var used int64
		if err := model.DB.Model(&model.OrganizationCharge{}).Scopes(model.OrgScope(org.Id)).Where("user_id = ? AND status IN ?", member.UserId, []string{"reserved", "settled"}).Select("COALESCE(SUM(quota), 0)").Scan(&used).Error; err != nil {
			common.ApiError(c, err)
			return
		}
		totalRemaining = max(int64(0), *member.SpendLimit-used)
		available = min(available, totalRemaining)
	}

	if monthlyLimitEnabled {
		start, end := model.OrganizationMonthlyWindow(common.GetTimestamp())
		var used int64
		if err := model.DB.Model(&model.OrganizationCharge{}).Scopes(model.OrgScope(org.Id)).Where("user_id = ? AND created_at >= ? AND created_at < ? AND status IN ?", member.UserId, start, end, []string{"reserved", "settled"}).Select("COALESCE(SUM(quota), 0)").Scan(&used).Error; err != nil {
			common.ApiError(c, err)
			return
		}
		monthlyRemaining = max(int64(0), *member.MonthlySpendLimit-used)
		available = min(available, monthlyRemaining)
	}
	if !authz.CanOrg(member.UserId, org.Id, member.Role, authz.Permission{Resource: "org.billing", Action: "read"}) {
		org.Quota = available
		memberCount = 1
	}
	common.ApiSuccess(c, gin.H{
		"available_quota": available, "request_count": requestCount, "quota": org.Quota,
		"used_quota": org.UsedQuota, "group": org.Group, "usage": usage,
		"member_count": memberCount, "key_count": keyCount, "spend_limit": member.SpendLimit,
		"total_limit_enabled": totalLimitEnabled, "total_remaining_quota": totalRemaining,
		"monthly_limit_enabled": monthlyLimitEnabled, "monthly_remaining_quota": monthlyRemaining,
	})
}

func GetOrganizationSettings(c *gin.Context) {
	org, _, err := model.GetOrganizationMembership(c.GetInt("org_id"), c.GetInt("id"))
	if err != nil {
		organizationError(c, err)
		return
	}
	settings, err := org.EffectiveSettings()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	var transfers []model.OrganizationTransfer
	if err := model.DB.Scopes(model.OrgScope(org.Id)).Where("expires_at > ?", common.GetTimestamp()).Find(&transfers).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"name": org.Name, "settings": settings, "transfers": transfers})
}

func UpdateOrganizationSettings(c *gin.Context) {
	var input struct {
		Name     string                     `json:"name"`
		Settings model.OrganizationSettings `json:"settings"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		organizationError(c, model.ErrOrganizationInput)
		return
	}
	if err := model.UpdateOrganizationSettings(c.GetInt("org_id"), c.GetInt("id"), input.Name, input.Settings); err != nil {
		organizationError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func GetOrganizationDeletionImpact(c *gin.Context) {
	orgID, err := strconv.Atoi(c.Param("org_id"))
	if err != nil {
		organizationError(c, model.ErrOrganizationInput)
		return
	}
	impact, err := model.GetOrganizationDeletionImpact(orgID, c.GetInt("id"))
	if err != nil {
		organizationError(c, err)
		return
	}
	common.ApiSuccess(c, impact)
}

func ChangeOrganizationStatus(c *gin.Context) {
	orgID, err := strconv.Atoi(c.Param("org_id"))
	if err != nil {
		organizationError(c, model.ErrOrganizationInput)
		return
	}
	var input struct {
		Status      int    `json:"status"`
		ConfirmName string `json:"confirm_name"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		organizationError(c, model.ErrOrganizationInput)
		return
	}
	if err := model.ChangeOrganizationStatus(orgID, c.GetInt("id"), input.Status, input.ConfirmName); err != nil {
		organizationError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func RequestOrganizationTransfer(c *gin.Context) {
	var input struct {
		TargetId int `json:"target_id"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		organizationError(c, model.ErrOrganizationInput)
		return
	}
	if err := model.RequestOrganizationTransfer(c.GetInt("org_id"), c.GetInt("id"), input.TargetId); err != nil {
		organizationError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func AcceptOrganizationTransfer(c *gin.Context) {
	if err := model.AcceptOrganizationTransfer(c.GetInt("org_id"), c.GetInt("id")); err != nil {
		organizationError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func SetOrganizationMemberLimits(c *gin.Context) {
	var input struct {
		UserIDs []int           `json:"user_ids"`
		Total   json.RawMessage `json:"spend_limit"`
		Monthly json.RawMessage `json:"monthly_spend_limit"`
	}
	if c.ShouldBindJSON(&input) != nil {
		organizationError(c, model.ErrOrganizationInput)
		return
	}
	limits := make(map[string]*int64, 2)
	for field, data := range map[string]json.RawMessage{"spend_limit": input.Total, "monthly_spend_limit": input.Monthly} {
		if len(data) == 0 {
			continue
		}
		var value *int64
		if err := common.Unmarshal(data, &value); err != nil {
			organizationError(c, model.ErrOrganizationInput)
			return
		}
		limits[field] = value
	}
	if err := model.SetOrganizationMemberLimits(c.GetInt("org_id"), c.GetInt("id"), input.UserIDs, limits); err != nil {
		organizationError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}
