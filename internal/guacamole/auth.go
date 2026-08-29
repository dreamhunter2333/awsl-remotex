package guacamole

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/dreamhunter2333/awsl-remotex/internal/assets"
	"github.com/dreamhunter2333/awsl-remotex/internal/credential"
)

type Authenticator struct {
	key      []byte
	basePath string
}

type connection struct {
	ID         string            `json:"id"`
	Protocol   string            `json:"protocol"`
	Parameters map[string]string `json:"parameters"`
}

type payload struct {
	Username    string                `json:"username"`
	Expires     int64                 `json:"expires"`
	Connections map[string]connection `json:"connections"`
}

const oneHalfDark = "foreground: rgb:dc/df/e4; background: rgb:28/2c/34; color0: rgb:28/2c/34; color1: rgb:e0/6c/75; color2: rgb:98/c3/79; color3: rgb:e5/c0/7b; color4: rgb:61/af/ef; color5: rgb:c6/78/dd; color6: rgb:56/b6/c2; color7: rgb:dc/df/e4; color8: rgb:28/2c/34; color9: rgb:e0/6c/75; color10: rgb:98/c3/79; color11: rgb:e5/c0/7b; color12: rgb:61/af/ef; color13: rgb:c6/78/dd; color14: rgb:56/b6/c2; color15: rgb:dc/df/e4"

const oneHalfLight = "foreground: rgb:38/3a/42; background: rgb:fa/fa/fa; color0: rgb:38/3a/42; color1: rgb:e4/56/49; color2: rgb:50/a1/4f; color3: rgb:c1/84/01; color4: rgb:01/84/bc; color5: rgb:a6/26/a4; color6: rgb:09/97/b3; color7: rgb:fa/fa/fa; color8: rgb:4f/52/5e; color9: rgb:e0/6c/75; color10: rgb:98/c3/79; color11: rgb:e5/c0/7b; color12: rgb:61/af/ef; color13: rgb:c6/78/dd; color14: rgb:56/b6/c2; color15: rgb:ff/ff/ff"

func New(secret, basePath string) (*Authenticator, error) {
	key, err := hex.DecodeString(strings.TrimSpace(secret))
	if err != nil || len(key) != 16 {
		return nil, errors.New("GUACAMOLE_JSON_SECRET must contain exactly 32 hexadecimal characters")
	}
	if basePath == "" {
		basePath = "/guacamole"
	}
	return &Authenticator{key: key, basePath: strings.TrimRight(basePath, "/")}, nil
}

func (auth *Authenticator) ConnectionURL(asset assets.Asset, credential credential.Value, theme string) (string, time.Time, error) {
	expires := time.Now().Add(30 * time.Second)
	parameters := ConnectionParameters(asset, credential, theme)

	plain, err := json.Marshal(payload{
		Username: "awsl-remotex",
		Expires:  expires.UnixMilli(),
		Connections: map[string]connection{
			asset.Name: {
				ID:         asset.ID,
				Protocol:   asset.Protocol,
				Parameters: parameters,
			},
		},
	})
	if err != nil {
		return "", time.Time{}, fmt.Errorf("encode guacamole payload: %w", err)
	}

	mac := hmac.New(sha256.New, auth.key)
	_, _ = mac.Write(plain)
	signed := append(mac.Sum(nil), plain...)
	signed = pad(signed, aes.BlockSize)

	block, err := aes.NewCipher(auth.key)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("create guacamole cipher: %w", err)
	}
	encrypted := make([]byte, len(signed))
	cipher.NewCBCEncrypter(block, make([]byte, aes.BlockSize)).CryptBlocks(encrypted, signed)
	token := base64.StdEncoding.EncodeToString(encrypted)
	return auth.basePath + "/?data=" + url.QueryEscape(token), expires, nil
}

func ConnectionParameters(asset assets.Asset, credential credential.Value, theme string) map[string]string {
	parameters := map[string]string{
		"hostname": asset.Host,
		"port":     strconv.Itoa(asset.Port),
		"username": asset.Username,
	}
	if asset.Protocol == "rdp" {
		parameters["ignore-cert"] = "true"
		parameters["resize-method"] = "display-update"
	}
	if asset.Protocol == "vnc" && asset.Settings.VNC != nil {
		if asset.Settings.VNC.Encodings != "" {
			parameters["encodings"] = asset.Settings.VNC.Encodings
		}
		if asset.Settings.VNC.ColorDepth != 0 {
			parameters["color-depth"] = strconv.Itoa(asset.Settings.VNC.ColorDepth)
		}
		if asset.Settings.VNC.Cursor != "" {
			parameters["cursor"] = asset.Settings.VNC.Cursor
		}
	}
	if asset.Protocol == "ssh" {
		parameters["font-name"] = "DejaVu Sans Mono"
		parameters["font-size"] = "11"
		parameters["color-scheme"] = oneHalfDark
		if theme == "light" {
			parameters["color-scheme"] = oneHalfLight
		}
	}
	if credential.Password != "" {
		parameters["password"] = credential.Password
	}
	if credential.PrivateKey != "" {
		parameters["private-key"] = credential.PrivateKey
	}
	if credential.Passphrase != "" {
		parameters["passphrase"] = credential.Passphrase
	}
	return parameters
}

func pad(value []byte, blockSize int) []byte {
	padding := blockSize - len(value)%blockSize
	return append(value, bytes.Repeat([]byte{byte(padding)}, padding)...)
}
