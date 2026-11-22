package database

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/dreamhunter2333/awsl-remotex/internal/assets"
	"github.com/dreamhunter2333/awsl-remotex/internal/credential"
)

type scanner interface {
	Scan(dest ...any) error
}

const assetColumns = `id, name, group_name, protocol, host, port, username, settings_json, credential_type,
			CASE WHEN credential IS NOT NULL AND length(credential) > 0 THEN 1 ELSE 0 END,
			created_at, updated_at`

func scanAsset(row scanner, extra ...any) (assets.Asset, error) {
	var asset assets.Asset
	var createdAt string
	var updatedAt string
	var settingsJSON string
	var credentialConfigured int
	fields := []any{
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
	}
	if err := row.Scan(append(fields, extra...)...); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return assets.Asset{}, assets.ErrNotFound
		}
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

func (store *Store) ListAssets(ctx context.Context) ([]assets.Asset, error) {
	rows, err := store.db.QueryContext(ctx, `SELECT `+assetColumns+`
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
	encrypted, err := store.prepareCredential(input, storedCredential{})
	if err != nil {
		return assets.Asset{}, err
	}
	settingsJSON, err := encodeSettings(input.Settings)
	if err != nil {
		return assets.Asset{}, err
	}
	now := formatTime(time.Now().UTC())
	row := store.db.QueryRowContext(ctx, `
		INSERT INTO assets (id, name, group_name, protocol, host, port, username, settings_json, credential_type, credential, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		RETURNING `+assetColumns,
		newID(), input.Name, input.Group, input.Protocol, input.Host, input.Port, input.Username, settingsJSON,
		input.CredentialType, encrypted, now, now)
	asset, err := scanAsset(row)
	if err != nil {
		return assets.Asset{}, fmt.Errorf("create asset: %w", err)
	}
	return asset, nil
}

func (store *Store) UpdateAsset(ctx context.Context, id string, input assets.Input) (assets.Asset, error) {
	if err := input.Normalize(); err != nil {
		return assets.Asset{}, err
	}
	settingsJSON, err := encodeSettings(input.Settings)
	if err != nil {
		return assets.Asset{}, err
	}
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return assets.Asset{}, fmt.Errorf("begin asset update: %w", err)
	}
	defer tx.Rollback()

	existing, err := readStoredCredential(tx.QueryRowContext(ctx, selectStoredCredential, id))
	if err != nil {
		return assets.Asset{}, err
	}
	encrypted, err := store.prepareCredential(input, existing)
	if err != nil {
		return assets.Asset{}, err
	}
	row := tx.QueryRowContext(ctx, `
		UPDATE assets
		SET name = ?, group_name = ?, protocol = ?, host = ?, port = ?, username = ?, settings_json = ?, credential_type = ?, credential = ?, updated_at = ?
		WHERE id = ?
		RETURNING `+assetColumns,
		input.Name, input.Group, input.Protocol, input.Host, input.Port, input.Username, settingsJSON,
		input.CredentialType, encrypted, formatTime(time.Now().UTC()), id)
	asset, err := scanAsset(row)
	if err != nil {
		return assets.Asset{}, fmt.Errorf("update asset: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return assets.Asset{}, fmt.Errorf("commit asset update: %w", err)
	}
	return asset, nil
}

func (store *Store) GetAssetWithCredential(ctx context.Context, id string) (assets.Asset, credential.Value, error) {
	var encrypted []byte
	row := store.db.QueryRowContext(ctx, `SELECT `+assetColumns+`, credential FROM assets WHERE id = ?`, id)
	asset, err := scanAsset(row, &encrypted)
	if err != nil {
		return assets.Asset{}, credential.Value{}, err
	}
	value, err := store.decryptCredential(encrypted)
	return asset, value, err
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
