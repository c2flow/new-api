package controller

import (
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/authz"
	"github.com/gin-gonic/gin"
)

func usageScope(c *gin.Context) model.ResourceScope {
	scope := model.ResourceScope{OrgID: c.GetInt("org_id"), UserID: c.GetInt("id")}
	if scope.OrgID == 0 {
		return scope
	}
	scope.AllMembers = authz.CanOrg(scope.UserID, scope.OrgID, c.GetString("org_role"), authz.Permission{Resource: "org.usage", Action: "read_all"})
	if scope.AllMembers {
		seen := make(map[int]struct{})
		for _, rawID := range strings.Split(c.Query("user_ids"), ",") {
			userID, err := strconv.Atoi(strings.TrimSpace(rawID))
			if err != nil || userID <= 0 {
				continue
			}
			if _, exists := seen[userID]; exists {
				continue
			}
			seen[userID] = struct{}{}
			scope.UserIDs = append(scope.UserIDs, userID)
			if len(scope.UserIDs) == 500 {
				break
			}
		}
		if len(scope.UserIDs) > 0 {
			return scope
		}
		if userID, err := strconv.Atoi(c.Query("user_id")); err == nil && userID > 0 {
			scope.UserID, scope.AllMembers = userID, false
		}
	}
	return scope
}

func GetScopedLogs(c *gin.Context) {
	page := common.GetPageQuery(c)
	logType, _ := strconv.Atoi(c.Query("type"))
	start, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	end, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	channel, _ := strconv.Atoi(c.Query("channel"))
	logs, total, err := model.GetAllLogs(logType, start, end, c.Query("model_name"), c.Query("username"), c.Query("token_name"), page.GetStartIdx(), page.GetPageSize(), channel, c.Query("group"), c.Query("request_id"), c.Query("upstream_request_id"), usageScope(c).Apply)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if c.GetInt("org_id") == 0 {
		model.FormatUserLogs(logs, page.GetStartIdx())
		page.SetItems(logs)
	} else {
		model.FormatOrganizationLogs(logs)
		type organizationLog struct {
			*model.Log
			Channel     *int    `json:"channel,omitempty"`
			ChannelName *string `json:"channel_name,omitempty"`
		}
		items := make([]organizationLog, len(logs))
		for i, log := range logs {
			items[i] = organizationLog{Log: log}
		}
		page.SetItems(items)
	}
	page.SetTotal(int(total))
	common.ApiSuccess(c, page)
}

func GetScopedLogStats(c *gin.Context) {
	start, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	end, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	channel, _ := strconv.Atoi(c.Query("channel"))
	stat, err := model.SumUsedQuota(model.LogTypeConsume, start, end, c.Query("model_name"), c.Query("username"), c.Query("token_name"), channel, c.Query("group"), usageScope(c).Apply)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, stat)
}
