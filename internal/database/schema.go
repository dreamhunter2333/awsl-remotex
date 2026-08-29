package database

import (
	"context"
	"fmt"
)

func (store *Store) initialize(ctx context.Context) error {
	statements := []string{
		`PRAGMA journal_mode = WAL`,
		`PRAGMA foreign_keys = ON`,
		`PRAGMA busy_timeout = 5000`,
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
	}

	for _, statement := range statements {
		if _, err := store.db.ExecContext(ctx, statement); err != nil {
			return fmt.Errorf("initialize sqlite: %w", err)
		}
	}
	if err := store.ensureColumn(ctx, "credential_type", "TEXT NOT NULL DEFAULT 'prompt'"); err != nil {
		return err
	}
	if err := store.ensureColumn(ctx, "credential", "BLOB"); err != nil {
		return err
	}
	return store.ensureColumn(ctx, "settings_json", "TEXT NOT NULL DEFAULT '{}'")
}

func (store *Store) ensureColumn(ctx context.Context, name, definition string) error {
	rows, err := store.db.QueryContext(ctx, `PRAGMA table_info(assets)`)
	if err != nil {
		return fmt.Errorf("read assets schema: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var index int
		var columnName string
		var columnType string
		var notNull int
		var defaultValue any
		var primaryKey int
		if err := rows.Scan(&index, &columnName, &columnType, &notNull, &defaultValue, &primaryKey); err != nil {
			return fmt.Errorf("scan assets schema: %w", err)
		}
		if columnName == name {
			return nil
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate assets schema: %w", err)
	}
	if _, err := store.db.ExecContext(ctx, `ALTER TABLE assets ADD COLUMN `+name+` `+definition); err != nil {
		return fmt.Errorf("add assets.%s: %w", name, err)
	}
	return nil
}
