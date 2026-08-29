package database

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"

	"github.com/dreamhunter2333/awsl-remotex/internal/assets"
)

type scanner interface {
	Scan(dest ...any) error
}

func scanAsset(row scanner) (assets.Asset, error) {
	var asset assets.Asset
	var createdAt string
	var updatedAt string
	var settingsJSON string
	var credentialConfigured int
	if err := row.Scan(
		&asset.ID,
		&asset.Name,
		&asset.Group,
		&asset.Protocol,
		&asset.Host,
		&asset.Port,
		&asset.Username,
		&settingsJSON,
		&asset.CredentialType,
		&credentialConfigured,
		&createdAt,
		&updatedAt,
	); err != nil {
		return assets.Asset{}, err
	}
	asset.CredentialConfigured = credentialConfigured == 1
	if err := json.Unmarshal([]byte(settingsJSON), &asset.Settings); err != nil {
		return assets.Asset{}, fmt.Errorf("decode asset settings: %w", err)
	}

	var err error
	asset.CreatedAt, err = time.Parse(time.RFC3339Nano, createdAt)
	if err != nil {
		return assets.Asset{}, fmt.Errorf("parse created_at: %w", err)
	}
	asset.UpdatedAt, err = time.Parse(time.RFC3339Nano, updatedAt)
	if err != nil {
		return assets.Asset{}, fmt.Errorf("parse updated_at: %w", err)
	}
	return asset, nil
}

func encodeSettings(settings assets.Settings) (string, error) {
	value, err := json.Marshal(settings)
	if err != nil {
		return "", fmt.Errorf("encode asset settings: %w", err)
	}
	return string(value), nil
}

func formatTime(value time.Time) string {
	return value.Format(time.RFC3339Nano)
}

func newID() string {
	buffer := make([]byte, 16)
	if _, err := rand.Read(buffer); err != nil {
		panic(fmt.Errorf("generate id: %w", err))
	}
	return hex.EncodeToString(buffer)
}
