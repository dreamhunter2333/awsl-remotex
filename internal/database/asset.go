package database

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"
)

type Asset struct {
	ID                   string    `json:"id"`
	Name                 string    `json:"name"`
	Group                string    `json:"group"`
	Protocol             string    `json:"protocol"`
	Host                 string    `json:"host"`
	Port                 int       `json:"port"`
	Username             string    `json:"username"`
	CredentialType       string    `json:"credentialType"`
	CredentialConfigured bool      `json:"credentialConfigured"`
	CreatedAt            time.Time `json:"createdAt"`
	UpdatedAt            time.Time `json:"updatedAt"`
}

type AssetInput struct {
	Name           string `json:"name"`
	Group          string `json:"group"`
	Protocol       string `json:"protocol"`
	Host           string `json:"host"`
	Port           int    `json:"port"`
	Username       string `json:"username"`
	CredentialType string `json:"credentialType"`
	Password       string `json:"password"`
	PrivateKey     string `json:"privateKey"`
	Passphrase     string `json:"passphrase"`
}

func (input *AssetInput) Normalize() error {
	input.Name = strings.TrimSpace(input.Name)
	input.Group = strings.TrimSpace(input.Group)
	input.Protocol = strings.ToLower(strings.TrimSpace(input.Protocol))
	input.Host = strings.TrimSpace(input.Host)
	input.Username = strings.TrimSpace(input.Username)
	input.CredentialType = strings.ToLower(strings.TrimSpace(input.CredentialType))

	if input.Name == "" || input.Host == "" {
		return errors.New("name and host are required")
	}
	if input.Group == "" {
		input.Group = "__default__"
	}
	if input.Protocol != "ssh" && input.Protocol != "rdp" && input.Protocol != "vnc" {
		return errors.New("protocol must be ssh, rdp, or vnc")
	}
	if input.Port == 0 {
		input.Port = defaultPort(input.Protocol)
	}
	if input.Port < 1 || input.Port > 65535 {
		return errors.New("port must be between 1 and 65535")
	}
	if input.CredentialType == "" {
		input.CredentialType = "prompt"
	}
	if input.CredentialType != "prompt" && input.CredentialType != "password" && input.CredentialType != "private-key" {
		return errors.New("credentialType must be prompt, password, or private-key")
	}
	if input.CredentialType == "private-key" && input.Protocol != "ssh" {
		return errors.New("private-key credentials are only supported for SSH")
	}
	return nil
}

func defaultPort(protocol string) int {
	switch protocol {
	case "ssh":
		return 22
	case "rdp":
		return 3389
	case "vnc":
		return 5900
	default:
		return 0
	}
}

type scanner interface {
	Scan(dest ...any) error
}

func scanAsset(row scanner) (Asset, error) {
	var asset Asset
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
		return Asset{}, err
	}
	asset.CredentialConfigured = credentialConfigured == 1

	var err error
	asset.CreatedAt, err = time.Parse(time.RFC3339Nano, createdAt)
	if err != nil {
		return Asset{}, fmt.Errorf("parse created_at: %w", err)
	}
	asset.UpdatedAt, err = time.Parse(time.RFC3339Nano, updatedAt)
	if err != nil {
		return Asset{}, fmt.Errorf("parse updated_at: %w", err)
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
