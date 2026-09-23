package controller

import (
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// These endpoints are deliberately separate from ordinary organization context.
// Platform authorization never turns org_id=0 into a wildcard in OrgScope.
func PlatformListOrganizations(c *gin.Context) {
	page := common.GetPageQuery(c)
	query := model.DB.Model(&model.Organization{})
	if keyword := strings.TrimSpace(c.Query("keyword")); keyword != "" {
		if id, err := strconv.Atoi(keyword); err == nil && id > 0 {
			query = query.Where("name LIKE ? OR remark LIKE ? OR id = ?", "%"+keyword+"%", "%"+keyword+"%", id)
		} else {
			query = query.Where("name LIKE ? OR remark LIKE ?", "%"+keyword+"%", "%"+keyword+"%")
		}
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	var organizations []model.Organization
	if err := query.Select("id", "name", "remark", "status", "owner_id", "quota", "used_quota", "group").Order("id desc").Offset(page.GetStartIdx()).Limit(page.GetPageSize()).Find(&organizations).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	ownerIDs := make([]int, 0, len(organizations))
	for _, org := range organizations {
		ownerIDs = append(ownerIDs, org.OwnerId)
	}
	var owners []model.User
	if len(ownerIDs) > 0 {
		if err := model.DB.Unscoped().Select("id", "username", "display_name").Where("id IN ?", ownerIDs).Find(&owners).Error; err != nil {
			common.ApiError(c, err)
			return
		}
	}
	ownerByID := make(map[int]model.User, len(owners))
	for _, owner := range owners {
		ownerByID[owner.Id] = owner
	}
	type organizationResponse struct {
		model.Organization
		Remark           string `json:"remark"`
		OwnerUsername    string `json:"owner_username"`
		OwnerDisplayName string `json:"owner_display_name"`
	}
	items := make([]organizationResponse, 0, len(organizations))
	for _, org := range organizations {
		owner := ownerByID[org.OwnerId]
		items = append(items, organizationResponse{Organization: org, Remark: org.Remark, OwnerUsername: owner.Username, OwnerDisplayName: owner.DisplayName})
	}
	page.SetTotal(int(total))
	page.SetItems(items)
	common.ApiSuccess(c, page)
}

func PlatformOrganizationResources(c *gin.Context) {
	orgID, err := strconv.Atoi(c.Param("org_id"))
	if err != nil || orgID <= 0 {
		organizationError(c, model.ErrOrganizationInput)
		return
	}
	var org model.Organization
	if err := model.DB.Select("id").Where("id = ?", orgID).First(&org).Error; err != nil {
		organizationError(c, model.ErrOrganizationAccess)
		return
	}
	page := common.GetPageQuery(c)
	var resource interface{}
	database := model.DB
	switch c.Param("resource") {
	case "members":
		members := &[]struct {
			model.OrganizationMember
			Username    string `json:"username"`
			DisplayName string `json:"display_name"`
			Email       string `json:"email"`
		}{}
		resource = members
	case "audit":
		resource = &[]model.OrganizationAudit{}
	case "logs":
		resource = &[]*model.Log{}
		database = model.LOG_DB
	default:
		organizationError(c, model.ErrOrganizationInput)
		return
	}
	query := database.Model(resource).Scopes(model.OrgScope(orgID))
	if c.Param("resource") == "members" {
		query = model.DB.Model(&model.OrganizationMember{}).
			Select("organization_members.*, users.username, users.display_name, users.email").
			Joins("JOIN users ON users.id = organization_members.user_id").Scopes(model.OrgScope(orgID))
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	order := "id desc"
	if c.Param("resource") == "members" {
		order = "organization_members.id desc"
	}
	if err := query.Order(order).Offset(page.GetStartIdx()).Limit(page.GetPageSize()).Find(resource).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	if logs, ok := resource.(*[]*model.Log); ok {
		if c.GetInt("role") < common.RoleRootUser {
			model.FormatAdminLogs(*logs)
		} else {
			model.FormatRootLogs(*logs)
		}
	}
	page.SetTotal(int(total))
	page.SetItems(resource)
	common.ApiSuccess(c, page)
}

func PlatformAddOrganizationMember(c *gin.Context) {
	orgID, err := strconv.Atoi(c.Param("org_id"))
	var input struct {
		Username          string `json:"username"`
		Role              string `json:"role"`
		SpendLimit        *int64 `json:"spend_limit"`
		MonthlySpendLimit *int64 `json:"monthly_spend_limit"`
		Reason            string `json:"reason"`
	}
	if err != nil || orgID <= 0 || c.ShouldBindJSON(&input) != nil {
		organizationError(c, model.ErrOrganizationInput)
		return
	}
	memberInput := model.PlatformOrganizationMemberInput{Username: input.Username, Role: input.Role, Reason: input.Reason}
	if input.SpendLimit != nil {
		memberInput.SpendLimit = *input.SpendLimit
	}
	if input.MonthlySpendLimit != nil {
		memberInput.MonthlySpendLimit = *input.MonthlySpendLimit
	}
	member, err := model.PlatformAddOrganizationMember(orgID, c.GetInt("id"), memberInput)
	if err != nil {
		organizationError(c, err)
		return
	}
	common.ApiSuccess(c, member)
}

func PlatformUpdateOrganizationMember(c *gin.Context) {
	orgID, orgErr := strconv.Atoi(c.Param("org_id"))
	userID, userErr := strconv.Atoi(c.Param("user_id"))
	var input struct {
		Role              string `json:"role"`
		Status            int    `json:"status"`
		SpendLimit        *int64 `json:"spend_limit"`
		MonthlySpendLimit *int64 `json:"monthly_spend_limit"`
		Reason            string `json:"reason"`
	}
	if orgErr != nil || userErr != nil || orgID <= 0 || userID <= 0 || c.ShouldBindJSON(&input) != nil || input.SpendLimit == nil || input.MonthlySpendLimit == nil {
		organizationError(c, model.ErrOrganizationInput)
		return
	}
	if err := model.PlatformUpdateOrganizationMember(orgID, c.GetInt("id"), userID, input.Role, input.Status, *input.SpendLimit, *input.MonthlySpendLimit, input.Reason); err != nil {
		organizationError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func PlatformChangeOrganizationStatus(c *gin.Context) {
	orgID, err := strconv.Atoi(c.Param("org_id"))
	var input struct {
		Status int    `json:"status"`
		Reason string `json:"reason"`
	}
	if err != nil || orgID <= 0 || c.ShouldBindJSON(&input) != nil || strings.TrimSpace(input.Reason) == "" || len(input.Reason) > 256 || (input.Status != model.OrganizationActive && input.Status != model.OrganizationDisabled) {
		organizationError(c, model.ErrOrganizationInput)
		return
	}
	err = model.DB.Transaction(func(tx *gorm.DB) error {
		return model.PlatformChangeOrganizationStatusTx(tx, orgID, c.GetInt("id"), input.Status, input.Reason)
	})
	if err != nil {
		organizationError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func PlatformAdjustOrganizationQuota(c *gin.Context) {
	orgID, err := strconv.Atoi(c.Param("org_id"))
	var input struct {
		Mode   string `json:"mode"`
		Value  *int64 `json:"value"`
		Reason string `json:"reason"`
	}
	if err != nil || orgID <= 0 || c.ShouldBindJSON(&input) != nil || input.Value == nil {
		organizationError(c, model.ErrOrganizationInput)
		return
	}
	quota, err := model.AdjustOrganizationQuota(orgID, c.GetInt("id"), input.Mode, *input.Value, input.Reason)
	if err != nil {
		organizationError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"quota": quota})
}

func PlatformSetOrganizationRemark(c *gin.Context) {
	orgID, err := strconv.Atoi(c.Param("org_id"))
	var input struct {
		Remark *string `json:"remark"`
	}
	if err != nil || orgID <= 0 || c.ShouldBindJSON(&input) != nil || input.Remark == nil {
		organizationError(c, model.ErrOrganizationInput)
		return
	}
	if err := model.PlatformSetOrganizationRemark(orgID, c.GetInt("id"), *input.Remark); err != nil {
		organizationError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func PlatformSetOrganizationGroup(c *gin.Context) {
	orgID, err := strconv.Atoi(c.Param("org_id"))
	var input struct {
		Group *string `json:"group"`
	}
	if err != nil || orgID <= 0 || c.ShouldBindJSON(&input) != nil || input.Group == nil {
		organizationError(c, model.ErrOrganizationInput)
		return
	}
	group := strings.TrimSpace(*input.Group)
	if group == "auto" || !ratio_setting.ContainsGroupRatio(group) {
		organizationError(c, model.ErrOrganizationInput)
		return
	}
	if err := model.PlatformSetOrganizationGroup(orgID, c.GetInt("id"), group); err != nil {
		organizationError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"group": group})
}
