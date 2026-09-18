package model

import (
	"fmt"
	"net/url"
	"strings"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

// OrganizationSettings deliberately excludes pricing, routing groups and credentials.
type OrganizationSettings struct {
	Logo              string `json:"logo"`
	DefaultSpendLimit int64  `json:"default_spend_limit"`
}

func (org *Organization) EffectiveSettings() (OrganizationSettings, error) {
	settings := OrganizationSettings{}
	if org.Settings != "" {
		if err := common.UnmarshalJsonStr(org.Settings, &settings); err != nil {
			return settings, err
		}
	}
	return settings, nil
}

func UpdateOrganizationSettings(orgID, actorID int, name string, settings OrganizationSettings) error {
	name = strings.TrimSpace(name)
	if name == "" || utf8.RuneCountInString(name) > 64 || settings.DefaultSpendLimit < 0 || settings.DefaultSpendLimit > int64(common.MaxWalletQuota) {
		return ErrOrganizationInput
	}
	if settings.Logo != "" {
		uri, err := url.Parse(settings.Logo)
		if err != nil || uri.Scheme != "https" || uri.Hostname() == "" || uri.User != nil || len(settings.Logo) > 2048 {
			return ErrOrganizationInput
		}
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		org, err := lockOrganizationManager(tx, orgID, actorID, false)
		if err != nil {
			return err
		}
		if name != org.Name {
			return ErrOrganizationInput
		}
		data, err := common.Marshal(settings)
		if err != nil {
			return err
		}
		org.Settings = string(data)
		if err := tx.Model(org).Update("settings", org.Settings).Error; err != nil {
			return err
		}
		return tx.Create(&OrganizationAudit{OrgId: orgID, ActorId: actorID, Action: "settings.update", ObjectId: fmt.Sprint(orgID), Result: "success"}).Error
	})
}
