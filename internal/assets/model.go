package assets

import (
	"errors"
	"strings"
	"time"
)

var ErrNotFound = errors.New("asset not found")

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

type Input struct {
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

func (input *Input) Normalize() error {
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
		input.Port = DefaultPort(input.Protocol)
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

func DefaultPort(protocol string) int {
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
