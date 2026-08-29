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
	Settings             Settings  `json:"settings"`
	CredentialType       string    `json:"credentialType"`
	CredentialConfigured bool      `json:"credentialConfigured"`
	CreatedAt            time.Time `json:"createdAt"`
	UpdatedAt            time.Time `json:"updatedAt"`
}

type Input struct {
	Name           string   `json:"name"`
	Group          string   `json:"group"`
	Protocol       string   `json:"protocol"`
	Host           string   `json:"host"`
	Port           int      `json:"port"`
	Username       string   `json:"username"`
	Settings       Settings `json:"settings"`
	CredentialType string   `json:"credentialType"`
	Password       string   `json:"password"`
	PrivateKey     string   `json:"privateKey"`
	Passphrase     string   `json:"passphrase"`
}

type Settings struct {
	VNC *VNCSettings `json:"vnc,omitempty"`
}

type VNCSettings struct {
	Encodings  string `json:"encodings,omitempty"`
	ColorDepth int    `json:"colorDepth,omitempty"`
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
	if input.Protocol != "vnc" {
		input.Settings.VNC = nil
		return nil
	}
	if input.Settings.VNC == nil {
		return nil
	}

	input.Settings.VNC.Encodings = strings.ToLower(strings.TrimSpace(input.Settings.VNC.Encodings))
	if input.Settings.VNC.Encodings != "" && input.Settings.VNC.Encodings != "tight" {
		return errors.New("VNC encodings must be tight")
	}
	switch input.Settings.VNC.ColorDepth {
	case 0, 8, 16, 24, 32:
	default:
		return errors.New("VNC colorDepth must be 8, 16, 24, or 32")
	}
	if input.Settings.VNC.Encodings == "" && input.Settings.VNC.ColorDepth == 0 {
		input.Settings.VNC = nil
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
