package config

import (
	"fmt"
	"os"
	"time"
)

type Config struct {
	Address             string
	DatabasePath        string
	WebDirectory        string
	AuthPassword        string
	CredentialKey       string
	GuacamoleJSONSecret string
	GuacamoleUpstream   string
	GuacamolePublicPath string
	GuacdAddress        string
	SessionIdleTimeout  time.Duration
}

func Load() (Config, error) {
	idleTimeout, err := time.ParseDuration(value("SESSION_IDLE_TIMEOUT", "24h"))
	if err != nil || idleTimeout <= 0 {
		return Config{}, fmt.Errorf("SESSION_IDLE_TIMEOUT must be a positive duration")
	}
	return Config{
		Address:             value("ADDR", ":8080"),
		DatabasePath:        value("DATABASE_PATH", "data/awsl-remotex.db"),
		WebDirectory:        value("WEB_DIR", "web/dist"),
		AuthPassword:        os.Getenv("AUTH_PASSWORD"),
		CredentialKey:       os.Getenv("CREDENTIAL_KEY"),
		GuacamoleJSONSecret: os.Getenv("GUACAMOLE_JSON_SECRET"),
		GuacamoleUpstream:   os.Getenv("GUACAMOLE_UPSTREAM"),
		GuacamolePublicPath: value("GUACAMOLE_PUBLIC_PATH", "/guacamole"),
		GuacdAddress:        value("GUACD_ADDRESS", "guacd:4822"),
		SessionIdleTimeout:  idleTimeout,
	}, nil
}

func value(name, fallback string) string {
	if result := os.Getenv(name); result != "" {
		return result
	}
	return fallback
}
