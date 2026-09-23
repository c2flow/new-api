package service

import (
	"fmt"
	"net"
	"os"
	"strings"
	"sync"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/gin-gonic/gin"
	"github.com/oschwald/maxminddb-golang"
)

type countryDatabase interface {
	Lookup(net.IP, any) error
	Close() error
}

type geoIPCountryRecord struct {
	Country struct {
		ISOCode string `maxminddb:"iso_code"`
	} `maxminddb:"country"`
	RegisteredCountry struct {
		ISOCode string `maxminddb:"iso_code"`
	} `maxminddb:"registered_country"`
}

var geoIPCountryState struct {
	sync.RWMutex
	database       countryDatabase
	trustedProxies []*net.IPNet
}

// InitGeoIPCountryDatabase loads the optional MMDB country database once and
// prepares the same trusted proxy ranges used by Gin for country headers.
func InitGeoIPCountryDatabase() error {
	trustedProxies, _, err := common.ResolveTrustedProxies(os.Getenv("TRUSTED_PROXIES"))
	if err != nil {
		return err
	}

	proxyNetworks := make([]*net.IPNet, 0, len(trustedProxies))
	for _, raw := range trustedProxies {
		if ip := net.ParseIP(raw); ip != nil {
			bits := 128
			if ip.To4() != nil {
				bits = 32
			}
			proxyNetworks = append(proxyNetworks, &net.IPNet{IP: ip, Mask: net.CIDRMask(bits, bits)})
			continue
		}
		_, network, parseErr := net.ParseCIDR(raw)
		if parseErr != nil {
			return fmt.Errorf("invalid trusted proxy %q: %w", raw, parseErr)
		}
		proxyNetworks = append(proxyNetworks, network)
	}

	var database countryDatabase
	path := strings.TrimSpace(os.Getenv("GEOIP_COUNTRY_DATABASE_PATH"))
	if path != "" {
		database, err = maxminddb.Open(path)
		if err != nil {
			return fmt.Errorf("open GeoIP country database %q: %w", path, err)
		}
	}

	geoIPCountryState.Lock()
	oldDatabase := geoIPCountryState.database
	geoIPCountryState.database = database
	geoIPCountryState.trustedProxies = proxyNetworks
	geoIPCountryState.Unlock()
	if oldDatabase != nil {
		_ = oldDatabase.Close()
	}

	if path != "" {
		common.SysLog("GeoIP country database loaded from " + path)
	}
	return nil
}

func CloseGeoIPCountryDatabase() error {
	geoIPCountryState.Lock()
	database := geoIPCountryState.database
	geoIPCountryState.database = nil
	geoIPCountryState.Unlock()
	if database == nil {
		return nil
	}
	return database.Close()
}

func lookupCountryCode(ip net.IP) string {
	if ip == nil || ip.IsPrivate() || ip.IsLoopback() || ip.IsUnspecified() {
		return ""
	}
	geoIPCountryState.RLock()
	defer geoIPCountryState.RUnlock()
	if geoIPCountryState.database == nil {
		return ""
	}
	var record geoIPCountryRecord
	if err := geoIPCountryState.database.Lookup(ip, &record); err != nil {
		return ""
	}
	if record.Country.ISOCode != "" {
		return strings.ToUpper(record.Country.ISOCode)
	}
	return strings.ToUpper(record.RegisteredCountry.ISOCode)
}

func isTrustedCountryHeaderSource(remoteAddr string) bool {
	host, _, err := net.SplitHostPort(strings.TrimSpace(remoteAddr))
	if err != nil {
		host = strings.TrimSpace(remoteAddr)
	}
	ip := net.ParseIP(host)
	if ip == nil {
		return false
	}
	geoIPCountryState.RLock()
	defer geoIPCountryState.RUnlock()
	for _, network := range geoIPCountryState.trustedProxies {
		if network.Contains(ip) {
			return true
		}
	}
	return false
}

// IsChinaRequest trusts country headers only from a configured trusted proxy,
// then falls back to the local MMDB lookup for the resolved client IP.
func IsChinaRequest(c *gin.Context) bool {
	if isTrustedCountryHeaderSource(c.Request.RemoteAddr) {
		countryCode := strings.TrimSpace(c.GetHeader("CF-IPCountry"))
		if countryCode == "" {
			countryCode = strings.TrimSpace(c.GetHeader("X-Country-Code"))
		}
		if countryCode != "" && !strings.EqualFold(countryCode, "XX") {
			return strings.EqualFold(countryCode, "CN")
		}
	}
	return IsChinaClientIP(c.ClientIP(), "")
}

// IsChinaClientIP accepts a trusted country code when supplied, otherwise it
// queries MMDB and finally checks the legacy CIDR override used by small tests.
func IsChinaClientIP(clientIP, trustedCountryCode string) bool {
	countryCode := strings.TrimSpace(trustedCountryCode)
	if countryCode != "" && !strings.EqualFold(countryCode, "XX") {
		return strings.EqualFold(countryCode, "CN")
	}
	ip := net.ParseIP(strings.TrimSpace(clientIP))
	if ip == nil {
		return false
	}
	if countryCode = lookupCountryCode(ip); countryCode != "" {
		return countryCode == "CN"
	}
	for _, raw := range strings.Split(os.Getenv("NEW_API_CHINA_IP_CIDRS"), ",") {
		_, network, err := net.ParseCIDR(strings.TrimSpace(raw))
		if err == nil && network.Contains(ip) {
			return true
		}
	}
	return false
}

func IsOverseasModel(modelName string, groups []string) bool {
	var vendorPolicy struct {
		VendorID     int
		VendorName   string
		OverseasOnly *bool
	}
	if err := model.DB.Table("models").Select("models.vendor_id, vendors.name AS vendor_name, vendors.overseas_only").Joins("JOIN vendors ON vendors.id = models.vendor_id").Where("models.model_name = ?", modelName).Scan(&vendorPolicy).Error; err == nil && vendorPolicy.VendorID > 0 {
		if vendorPolicy.OverseasOnly != nil {
			return *vendorPolicy.OverseasOnly
		}
		return isDefaultOverseasProvider(vendorPolicy.VendorName)
	}
	owners, err := model.GetPreferredModelOwnerChannelTypes([]string{modelName}, groups)
	if err != nil {
		return false
	}
	for _, channelType := range owners {
		if isDefaultOverseasProvider(constant.GetChannelTypeName(channelType)) {
			return true
		}
	}
	return false
}

func isDefaultOverseasProvider(name string) bool {
	name = strings.ToLower(strings.TrimSpace(name))
	for _, provider := range setting.DefaultOverseasProviders {
		if strings.Contains(name, provider) {
			return true
		}
	}
	return false
}

func IsOverseasModelBlocked(c *gin.Context, modelName string, groups []string) bool {
	return setting.OverseasModelRestrictionEnabled && IsChinaRequest(c) && IsOverseasModel(modelName, groups)
}
