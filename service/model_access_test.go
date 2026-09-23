package service

import (
	"net"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type fakeCountryDatabase struct {
	countries           map[string]string
	registeredCountries map[string]string
}

func (f *fakeCountryDatabase) Lookup(ip net.IP, result any) error {
	record := result.(*geoIPCountryRecord)
	record.Country.ISOCode = f.countries[ip.String()]
	record.RegisteredCountry.ISOCode = f.registeredCountries[ip.String()]
	return nil
}

func (f *fakeCountryDatabase) Close() error {
	return nil
}

func setCountryDatabaseForTest(t *testing.T, database countryDatabase) {
	t.Helper()
	geoIPCountryState.Lock()
	previous := geoIPCountryState.database
	geoIPCountryState.database = database
	geoIPCountryState.Unlock()
	t.Cleanup(func() {
		geoIPCountryState.Lock()
		geoIPCountryState.database = previous
		geoIPCountryState.Unlock()
	})
}

func TestIsChinaClientIPUsesMMDBCountry(t *testing.T) {
	t.Setenv("NEW_API_CHINA_IP_CIDRS", "")
	setCountryDatabaseForTest(t, &fakeCountryDatabase{
		countries: map[string]string{
			"1.2.3.4": "CN",
			"8.8.8.8": "US",
		},
		registeredCountries: map[string]string{
			"9.9.9.9": "CN",
		},
	})

	assert.True(t, IsChinaClientIP("1.2.3.4", ""))
	assert.False(t, IsChinaClientIP("8.8.8.8", ""))
	assert.True(t, IsChinaClientIP("9.9.9.9", ""))
	assert.False(t, IsChinaClientIP("invalid", ""))
}

func TestIsChinaClientIPFallsBackToConfiguredCIDRs(t *testing.T) {
	t.Setenv("NEW_API_CHINA_IP_CIDRS", "203.0.113.0/24")
	setCountryDatabaseForTest(t, nil)

	assert.True(t, IsChinaClientIP("203.0.113.10", ""))
	assert.False(t, IsChinaClientIP("198.51.100.1", ""))
}

func TestIsChinaRequestOnlyTrustsCountryHeadersFromTrustedProxy(t *testing.T) {
	t.Setenv("GEOIP_COUNTRY_DATABASE_PATH", "")
	t.Setenv("NEW_API_CHINA_IP_CIDRS", "")
	t.Setenv("TRUSTED_PROXIES", "10.0.0.0/8")
	require.NoError(t, InitGeoIPCountryDatabase())
	t.Cleanup(func() {
		require.NoError(t, CloseGeoIPCountryDatabase())
	})

	gin.SetMode(gin.TestMode)
	directContext, _ := gin.CreateTestContext(httptest.NewRecorder())
	directContext.Request = httptest.NewRequest("GET", "/", nil)
	directContext.Request.RemoteAddr = "198.51.100.10:1234"
	directContext.Request.Header.Set("CF-IPCountry", "CN")
	assert.False(t, IsChinaRequest(directContext), "a direct client must not be able to forge a country header")

	proxyContext, _ := gin.CreateTestContext(httptest.NewRecorder())
	proxyContext.Request = httptest.NewRequest("GET", "/", nil)
	proxyContext.Request.RemoteAddr = "10.0.0.2:1234"
	proxyContext.Request.Header.Set("X-Country-Code", "CN")
	assert.True(t, IsChinaRequest(proxyContext))

	proxyContext.Request.Header.Set("X-Country-Code", "US")
	assert.False(t, IsChinaRequest(proxyContext))
}

func TestDefaultOverseasProviders(t *testing.T) {
	testCases := map[string]bool{
		"Anthropic":     true,
		"OpenAI":        true,
		"xAI":           true,
		"Google Gemini": true,
		"Google":        true,
		"DeepSeek":      false,
	}
	for name, expected := range testCases {
		t.Run(name, func(t *testing.T) {
			assert.Equal(t, expected, isDefaultOverseasProvider(name))
		})
	}
}
