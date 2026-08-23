package database

import (
	"crypto/rand"
	"encoding/hex"
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
	var credentialConfigured int
	if err := row.Scan(
		&asset.ID,
		&asset.Name,
		&asset.Group,
		&asset.Protocol,
		&asset.Host,
		&asset.Port,
		&asset.Username,
		&asset.CredentialType,
		&credentialConfigured,
		&createdAt,
		&updatedAt,
	); err != nil {
		return assets.Asset{}, err
	}
	asset.CredentialConfigured = credentialConfigured == 1

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
