package database

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/dreamhunter2333/awsl-remotex/internal/assets"
	"github.com/dreamhunter2333/awsl-remotex/internal/credential"
)

const selectStoredCredential = `SELECT credential_type, credential FROM assets WHERE id = ?`

type storedCredential struct {
	kind      string
	encrypted []byte
}

func readStoredCredential(row scanner) (storedCredential, error) {
	var stored storedCredential
	err := row.Scan(&stored.kind, &stored.encrypted)
	if errors.Is(err, sql.ErrNoRows) {
		return storedCredential{}, assets.ErrNotFound
	}
	if err != nil {
		return storedCredential{}, fmt.Errorf("read stored credential: %w", err)
	}
	return stored, nil
}

func (store *Store) decryptCredential(encrypted []byte) (credential.Value, error) {
	if len(encrypted) == 0 {
		return credential.Value{}, nil
	}
	if store.vault == nil {
		return credential.Value{}, errors.New("credential vault is not configured")
	}
	return store.vault.Decrypt(encrypted)
}

func (store *Store) prepareCredential(input assets.Input, existing storedCredential) ([]byte, error) {
	if input.CredentialType == "prompt" {
		return nil, nil
	}
	if input.CredentialType == existing.kind && len(existing.encrypted) > 0 {
		switch {
		case input.CredentialType == "password" && input.Password == "":
			return existing.encrypted, nil
		case input.CredentialType == "private-key" && input.PrivateKey == "":
			if input.Passphrase == "" {
				return existing.encrypted, nil
			}
			value, err := store.decryptCredential(existing.encrypted)
			if err != nil {
				return nil, err
			}
			value.Passphrase = input.Passphrase
			return store.vault.Encrypt(value)
		}
	}
	if store.vault == nil {
		return nil, errors.New("CREDENTIAL_KEY is required to save credentials")
	}
	if input.CredentialType == "password" && input.Password == "" {
		return nil, errors.New("password is required")
	}
	if input.CredentialType == "private-key" && input.PrivateKey == "" {
		return nil, errors.New("private key is required")
	}
	return store.vault.Encrypt(credential.Value{
		Password: input.Password, PrivateKey: input.PrivateKey, Passphrase: input.Passphrase,
	})
}

func (store *Store) ResolveCredential(ctx context.Context, id string, input assets.Input) (credential.Value, error) {
	if input.CredentialType == "prompt" {
		return credential.Value{}, nil
	}
	value := credential.Value{
		Password:   input.Password,
		PrivateKey: input.PrivateKey,
		Passphrase: input.Passphrase,
	}
	if id == "" {
		return value, nil
	}
	stored, err := readStoredCredential(store.db.QueryRowContext(ctx, selectStoredCredential, id))
	if err != nil {
		return credential.Value{}, err
	}
	if stored.kind != input.CredentialType || len(stored.encrypted) == 0 {
		return value, nil
	}
	existing, err := store.decryptCredential(stored.encrypted)
	if err != nil {
		return credential.Value{}, err
	}
	if input.CredentialType == "password" && value.Password == "" {
		value.Password = existing.Password
	}
	if input.CredentialType == "private-key" {
		if value.PrivateKey == "" {
			value.PrivateKey = existing.PrivateKey
		}
		if value.Passphrase == "" {
			value.Passphrase = existing.Passphrase
		}
	}
	return value, nil
}
