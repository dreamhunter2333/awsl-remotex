package credential

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
)

type Value struct {
	Password   string `json:"password,omitempty"`
	PrivateKey string `json:"privateKey,omitempty"`
	Passphrase string `json:"passphrase,omitempty"`
}

type Vault struct {
	aead cipher.AEAD
}

func New(secret string) (*Vault, error) {
	key, err := hex.DecodeString(strings.TrimSpace(secret))
	if err != nil || len(key) != 32 {
		return nil, errors.New("CREDENTIAL_KEY must contain exactly 64 hexadecimal characters")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("create credential cipher: %w", err)
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("create credential vault: %w", err)
	}
	return &Vault{aead: aead}, nil
}

func (vault *Vault) Encrypt(value Value) ([]byte, error) {
	plain, err := json.Marshal(value)
	if err != nil {
		return nil, fmt.Errorf("encode credential: %w", err)
	}
	nonce := make([]byte, vault.aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, fmt.Errorf("generate credential nonce: %w", err)
	}
	return vault.aead.Seal(nonce, nonce, plain, nil), nil
}

func (vault *Vault) Decrypt(encrypted []byte) (Value, error) {
	nonceSize := vault.aead.NonceSize()
	if len(encrypted) < nonceSize {
		return Value{}, errors.New("invalid encrypted credential")
	}
	plain, err := vault.aead.Open(nil, encrypted[:nonceSize], encrypted[nonceSize:], nil)
	if err != nil {
		return Value{}, errors.New("decrypt credential")
	}
	var value Value
	if err := json.Unmarshal(plain, &value); err != nil {
		return Value{}, fmt.Errorf("decode credential: %w", err)
	}
	return value, nil
}
