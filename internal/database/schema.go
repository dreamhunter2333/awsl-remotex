package database

import (
	"context"
	"database/sql"
	"fmt"
)

func (store *Store) initialize(ctx context.Context) error {
	for _, statement := range []string{
		`PRAGMA journal_mode = WAL`,
		`PRAGMA foreign_keys = ON`,
		`PRAGMA busy_timeout = 5000`,
	} {
		if _, err := store.db.ExecContext(ctx, statement); err != nil {
			return fmt.Errorf("configure sqlite: %w", err)
		}
	}
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin schema migration: %w", err)
	}
	defer tx.Rollback()
	for _, statement := range []string{
		`CREATE TABLE IF NOT EXISTS assets (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			group_name TEXT NOT NULL,
			protocol TEXT NOT NULL CHECK (protocol IN ('ssh', 'rdp', 'vnc')),
			host TEXT NOT NULL,
			port INTEGER NOT NULL CHECK (port BETWEEN 1 AND 65535),
			username TEXT NOT NULL DEFAULT '',
			settings_json TEXT NOT NULL DEFAULT '{}',
			credential_type TEXT NOT NULL DEFAULT 'prompt',
			credential BLOB,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS assets_group_name_idx ON assets(group_name, name)`,
	} {
		if _, err := tx.ExecContext(ctx, statement); err != nil {
			return fmt.Errorf("initialize sqlite: %w", err)
		}
	}
	columns, err := assetColumnNames(ctx, tx)
	if err != nil {
		return err
	}
	for _, column := range []struct{ name, definition string }{
		{"credential_type", "TEXT NOT NULL DEFAULT 'prompt'"},
		{"credential", "BLOB"},
		{"settings_json", "TEXT NOT NULL DEFAULT '{}'"},
	} {
		if columns[column.name] {
			continue
		}
		if _, err := tx.ExecContext(ctx, `ALTER TABLE assets ADD COLUMN `+column.name+` `+column.definition); err != nil {
			return fmt.Errorf("add assets.%s: %w", column.name, err)
		}
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit schema migration: %w", err)
	}
	return nil
}

func assetColumnNames(ctx context.Context, tx *sql.Tx) (map[string]bool, error) {
	rows, err := tx.QueryContext(ctx, `PRAGMA table_info(assets)`)
	if err != nil {
		return nil, fmt.Errorf("read assets schema: %w", err)
	}
	defer rows.Close()
	columns := make(map[string]bool)
	for rows.Next() {
		var index int
		var columnName string
		var columnType string
		var notNull int
		var defaultValue any
		var primaryKey int
		if err := rows.Scan(&index, &columnName, &columnType, &notNull, &defaultValue, &primaryKey); err != nil {
			return nil, fmt.Errorf("scan assets schema: %w", err)
		}
		columns[columnName] = true
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate assets schema: %w", err)
	}
	return columns, nil
}
