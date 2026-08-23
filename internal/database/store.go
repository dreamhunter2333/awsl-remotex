package database

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/dreamhunter2333/awsl-remotex/internal/assets"
	"github.com/dreamhunter2333/awsl-remotex/internal/credential"
	_ "modernc.org/sqlite"
)

type Store struct {
	db    *sql.DB
	vault *credential.Vault
}

func Open(ctx context.Context, path string, vault *credential.Vault) (*Store, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		return nil, fmt.Errorf("create database directory: %w", err)
	}

	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	db.SetMaxOpenConns(1)

	store := &Store{db: db, vault: vault}
	if err := store.initialize(ctx); err != nil {
		db.Close()
		return nil, err
	}
	return store, nil
}

func (store *Store) Close() error {
	return store.db.Close()
}

func (store *Store) Ping(ctx context.Context) error {
	return store.db.PingContext(ctx)
}

func (store *Store) ListAssets(ctx context.Context) ([]assets.Asset, error) {
	rows, err := store.db.QueryContext(ctx, `
		SELECT id, name, group_name, protocol, host, port, username, credential_type,
			CASE WHEN credential IS NOT NULL AND length(credential) > 0 THEN 1 ELSE 0 END,
			created_at, updated_at
		FROM assets
		ORDER BY group_name COLLATE NOCASE, name COLLATE NOCASE
	`)
	if err != nil {
		return nil, fmt.Errorf("list assets: %w", err)
	}
	defer rows.Close()

	result := make([]assets.Asset, 0)
	for rows.Next() {
		asset, err := scanAsset(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, asset)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate assets: %w", err)
	}
	return result, nil
}

func (store *Store) CreateAsset(ctx context.Context, input assets.Input) (assets.Asset, error) {
	if err := input.Normalize(); err != nil {
		return assets.Asset{}, err
	}

	credentialType, encrypted, err := store.prepareCredential(input, "", nil)
	if err != nil {
		return assets.Asset{}, err
	}
	now := time.Now().UTC()
	asset := assets.Asset{
		ID:                   newID(),
		Name:                 input.Name,
		Group:                input.Group,
		Protocol:             input.Protocol,
		Host:                 input.Host,
		Port:                 input.Port,
		Username:             input.Username,
		CredentialType:       credentialType,
		CredentialConfigured: len(encrypted) > 0,
		CreatedAt:            now,
		UpdatedAt:            now,
	}

	_, err = store.db.ExecContext(ctx, `
		INSERT INTO assets (id, name, group_name, protocol, host, port, username, credential_type, credential, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, asset.ID, asset.Name, asset.Group, asset.Protocol, asset.Host, asset.Port, asset.Username, credentialType, encrypted, formatTime(now), formatTime(now))
	if err != nil {
		return assets.Asset{}, fmt.Errorf("create asset: %w", err)
	}
	return asset, nil
}

func (store *Store) UpdateAsset(ctx context.Context, id string, input assets.Input) (assets.Asset, error) {
	if err := input.Normalize(); err != nil {
		return assets.Asset{}, err
	}

	var existingType string
	var existingCredential []byte
	err := store.db.QueryRowContext(ctx, `SELECT credential_type, credential FROM assets WHERE id = ?`, id).Scan(&existingType, &existingCredential)
	if errors.Is(err, sql.ErrNoRows) {
		return assets.Asset{}, assets.ErrNotFound
	}
	if err != nil {
		return assets.Asset{}, fmt.Errorf("read existing credential: %w", err)
	}
	credentialType, encrypted, err := store.prepareCredential(input, existingType, existingCredential)
	if err != nil {
		return assets.Asset{}, err
	}

	now := time.Now().UTC()
	result, err := store.db.ExecContext(ctx, `
		UPDATE assets
		SET name = ?, group_name = ?, protocol = ?, host = ?, port = ?, username = ?, credential_type = ?, credential = ?, updated_at = ?
		WHERE id = ?
	`, input.Name, input.Group, input.Protocol, input.Host, input.Port, input.Username, credentialType, encrypted, formatTime(now), id)
	if err != nil {
		return assets.Asset{}, fmt.Errorf("update asset: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return assets.Asset{}, fmt.Errorf("read affected rows: %w", err)
	}
	if affected == 0 {
		return assets.Asset{}, assets.ErrNotFound
	}
	return store.GetAsset(ctx, id)
}

func (store *Store) GetAsset(ctx context.Context, id string) (assets.Asset, error) {
	row := store.db.QueryRowContext(ctx, `
		SELECT id, name, group_name, protocol, host, port, username, credential_type,
			CASE WHEN credential IS NOT NULL AND length(credential) > 0 THEN 1 ELSE 0 END,
			created_at, updated_at
		FROM assets
		WHERE id = ?
	`, id)
	asset, err := scanAsset(row)
	if errors.Is(err, sql.ErrNoRows) {
		return assets.Asset{}, assets.ErrNotFound
	}
	return asset, err
}

func (store *Store) GetCredential(ctx context.Context, id string) (credential.Value, error) {
	var encrypted []byte
	err := store.db.QueryRowContext(ctx, `SELECT credential FROM assets WHERE id = ?`, id).Scan(&encrypted)
	if errors.Is(err, sql.ErrNoRows) {
		return credential.Value{}, assets.ErrNotFound
	}
	if err != nil {
		return credential.Value{}, fmt.Errorf("read credential: %w", err)
	}
	if len(encrypted) == 0 {
		return credential.Value{}, nil
	}
	if store.vault == nil {
		return credential.Value{}, errors.New("credential vault is not configured")
	}
	return store.vault.Decrypt(encrypted)
}

func (store *Store) prepareCredential(input assets.Input, existingType string, existing []byte) (string, []byte, error) {
	if input.CredentialType == "prompt" {
		return "prompt", nil, nil
	}
	if input.CredentialType == existingType && len(existing) > 0 {
		if input.CredentialType == "password" && input.Password == "" {
			return existingType, existing, nil
		}
		if input.CredentialType == "private-key" && input.PrivateKey == "" {
			if input.Passphrase == "" {
				return existingType, existing, nil
			}
			if store.vault == nil {
				return "", nil, errors.New("credential vault is not configured")
			}
			value, err := store.vault.Decrypt(existing)
			if err != nil {
				return "", nil, err
			}
			value.Passphrase = input.Passphrase
			encrypted, err := store.vault.Encrypt(value)
			return existingType, encrypted, err
		}
	}
	if store.vault == nil {
		return "", nil, errors.New("CREDENTIAL_KEY is required to save credentials")
	}
	value := credential.Value{Password: input.Password, PrivateKey: input.PrivateKey, Passphrase: input.Passphrase}
	if input.CredentialType == "password" && value.Password == "" {
		return "", nil, errors.New("password is required")
	}
	if input.CredentialType == "private-key" && value.PrivateKey == "" {
		return "", nil, errors.New("private key is required")
	}
	encrypted, err := store.vault.Encrypt(value)
	if err != nil {
		return "", nil, err
	}
	return input.CredentialType, encrypted, nil
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
	existingAsset, err := store.GetAsset(ctx, id)
	if err != nil {
		return credential.Value{}, err
	}
	if existingAsset.CredentialType != input.CredentialType || !existingAsset.CredentialConfigured {
		return value, nil
	}
	existing, err := store.GetCredential(ctx, id)
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

func (store *Store) DeleteAsset(ctx context.Context, id string) error {
	result, err := store.db.ExecContext(ctx, `DELETE FROM assets WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete asset: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("read affected rows: %w", err)
	}
	if affected == 0 {
		return assets.ErrNotFound
	}
	return nil
}
