package authz

import (
	"strings"

	"github.com/QuantumNous/new-api/model"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// migratePlatformPolicies upgrades the organization branch's former domain
// policies. Only wildcard platform policies become global; organization rules
// and role bindings are obsolete now that membership roles are checked directly.
func migratePlatformPolicies(db *gorm.DB) error {
	return db.Transaction(func(tx *gorm.DB) error {
		var rules []model.CasbinRule
		if err := tx.Where("ptype = ? AND v4 <> ?", "p", "").Find(&rules).Error; err != nil {
			return err
		}
		for _, rule := range rules {
			if rule.V1 == "*" && !strings.HasPrefix(rule.V0, "org-role:") && !strings.HasPrefix(rule.V2, "org.") {
				converted := newRule("p", []string{rule.V0, rule.V2, rule.V3, rule.V4})
				if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&converted).Error; err != nil {
					return err
				}
			}
			if err := tx.Delete(&rule).Error; err != nil {
				return err
			}
		}
		return tx.Where("ptype = ?", "g").Delete(&model.CasbinRule{}).Error
	})
}
