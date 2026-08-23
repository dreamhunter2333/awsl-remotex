package database

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/dreamhunter2333/awsl-remotex/internal/credential"
	_ "modernc.org/sqlite"
)

var ErrNotFound = errors.New("not found")

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

func (store *Store) ListAssets(ctx context.Context) ([]Asset, error) {
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

	assets := make([]Asset, 0)
	for rows.Next() {
		asset, err := scanAsset(rows)
		if err != nil {
			return nil, err
		}
		assets = append(assets, asset)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate assets: %w", err)
	}
	return assets, nil
}

func (store *Store) CreateAsset(ctx context.Context, input AssetInput) (Asset, error) {
	if err := input.Normalize(); err != nil {
		return Asset{}, err
	}

	credentialType, encrypted, err := store.prepareCredential(input, "", nil)
	if err != nil {
		return Asset{}, err
	}
	now := time.Now().UTC()
	asset := Asset{
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
		return Asset{}, fmt.Errorf("create asset: %w", err)
	}
	return asset, nil
}

func (store *Store) UpdateAsset(ctx context.Context, id string, input AssetInput) (Asset, error) {
	if err := input.Normalize(); err != nil {
		return Asset{}, err
	}

	var existingType string
	var existingCredential []byte
	err := store.db.QueryRowContext(ctx, `SELECT credential_type, credential FROM assets WHERE id = ?`, id).Scan(&existingType, &existingCredential)
	if errors.Is(err, sql.ErrNoRows) {
		return Asset{}, ErrNotFound
	}
	if err != nil {
		return Asset{}, fmt.Errorf("read existing credential: %w", err)
	}
	credentialType, encrypted, err := store.prepareCredential(input, existingType, existingCredential)
	if err != nil {
		return Asset{}, err
	}

	now := time.Now().UTC()
	result, err := store.db.ExecContext(ctx, `
		UPDATE assets
		SET name = ?, group_name = ?, protocol = ?, host = ?, port = ?, username = ?, credential_type = ?, credential = ?, updated_at = ?
		WHERE id = ?
	`, input.Name, input.Group, input.Protocol, input.Host, input.Port, input.Username, credentialType, encrypted, formatTime(now), id)
	if err != nil {
		return Asset{}, fmt.Errorf("update asset: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return Asset{}, fmt.Errorf("read affected rows: %w", err)
	}
	if affected == 0 {
		return Asset{}, ErrNotFound
	}
	return store.GetAsset(ctx, id)
}

func (store *Store) GetAsset(ctx context.Context, id string) (Asset, error) {
	row := store.db.QueryRowContext(ctx, `
		SELECT id, name, group_name, protocol, host, port, username, credential_type,
			CASE WHEN credential IS NOT NULL AND length(credential) > 0 THEN 1 ELSE 0 END,
			created_at, updated_at
		FROM assets
		WHERE id = ?
	`, id)
	asset, err := scanAsset(row)
	if errors.Is(err, sql.ErrNoRows) {
		return Asset{}, ErrNotFound
	}
	return asset, err
}

func (store *Store) GetCredential(ctx context.Context, id string) (credential.Value, error) {
	var encrypted []byte
	err := store.db.QueryRowContext(ctx, `SELECT credential FROM assets WHERE id = ?`, id).Scan(&encrypted)
	if errors.Is(err, sql.ErrNoRows) {
		return credential.Value{}, ErrNotFound
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

func (store *Store) prepareCredential(input AssetInput, existingType string, existing []byte) (string, []byte, error) {
	if input.CredentialType == "prompt" {
		return "prompt", nil, nil
	}
	if input.CredentialType == existingType && input.Password == "" && input.PrivateKey == "" && len(existing) > 0 {
		return existingType, existing, nil
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
		return ErrNotFound
	}
	return nil
}
