package database

import (
	"context"
	"database/sql"
	"path/filepath"
	"strings"
	"testing"

	"github.com/dreamhunter2333/awsl-remotex/internal/assets"
	"github.com/dreamhunter2333/awsl-remotex/internal/credential"
)

func TestUpdatePrivateKeyPassphrase(t *testing.T) {
	vault, err := credential.New(strings.Repeat("1", 64))
	if err != nil {
		t.Fatal(err)
	}
	store, err := Open(context.Background(), filepath.Join(t.TempDir(), "test.db"), vault)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })

	created, err := store.CreateAsset(context.Background(), assets.Input{
		Name: "server", Protocol: "ssh", Host: "127.0.0.1", Port: 22,
		CredentialType: "private-key", PrivateKey: "key", Passphrase: "old",
	})
	if err != nil {
		t.Fatal(err)
	}
	_, err = store.UpdateAsset(context.Background(), created.ID, assets.Input{
		Name: "server", Protocol: "ssh", Host: "127.0.0.1", Port: 22,
		CredentialType: "private-key", Passphrase: "new",
	})
	if err != nil {
		t.Fatal(err)
	}
	value, err := store.GetCredential(context.Background(), created.ID)
	if err != nil {
		t.Fatal(err)
	}
	if value.PrivateKey != "key" || value.Passphrase != "new" {
		t.Fatalf("unexpected credential: %#v", value)
	}
}

func TestResolveCredentialUsesSavedValues(t *testing.T) {
	vault, err := credential.New(strings.Repeat("2", 64))
	if err != nil {
		t.Fatal(err)
	}
	store, err := Open(context.Background(), filepath.Join(t.TempDir(), "test.db"), vault)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })

	created, err := store.CreateAsset(context.Background(), assets.Input{
		Name: "server", Protocol: "rdp", Host: "127.0.0.1", CredentialType: "password", Password: "secret",
	})
	if err != nil {
		t.Fatal(err)
	}
	value, err := store.ResolveCredential(context.Background(), created.ID, assets.Input{CredentialType: "password"})
	if err != nil {
		t.Fatal(err)
	}
	if value.Password != "secret" {
		t.Fatal("saved password was not resolved")
	}
}

func TestVNCSettingsRoundTrip(t *testing.T) {
	store, err := Open(context.Background(), filepath.Join(t.TempDir(), "test.db"), nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })

	created, err := store.CreateAsset(context.Background(), assets.Input{
		Name:     "console",
		Protocol: "vnc",
		Host:     "127.0.0.1",
		Settings: assets.Settings{VNC: &assets.VNCSettings{Encodings: "tight", ColorDepth: 32}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if created.Settings.VNC == nil || created.Settings.VNC.Encodings != "tight" || created.Settings.VNC.ColorDepth != 32 {
		t.Fatalf("unexpected VNC settings: %#v", created.Settings.VNC)
	}

	stored, err := store.GetAsset(context.Background(), created.ID)
	if err != nil {
		t.Fatal(err)
	}
	if stored.Settings.VNC == nil || stored.Settings.VNC.Encodings != "tight" || stored.Settings.VNC.ColorDepth != 32 {
		t.Fatalf("unexpected stored VNC settings: %#v", stored.Settings.VNC)
	}

	updated, err := store.UpdateAsset(context.Background(), created.ID, assets.Input{
		Name: "console", Protocol: "vnc", Host: "127.0.0.1",
	})
	if err != nil {
		t.Fatal(err)
	}
	if updated.Settings.VNC != nil {
		t.Fatalf("expected VNC settings to be cleared: %#v", updated.Settings.VNC)
	}
}

func TestOpenMigratesAssetSettings(t *testing.T) {
	path := filepath.Join(t.TempDir(), "test.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`CREATE TABLE assets (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		group_name TEXT NOT NULL,
		protocol TEXT NOT NULL,
		host TEXT NOT NULL,
		port INTEGER NOT NULL,
		username TEXT NOT NULL DEFAULT '',
		credential_type TEXT NOT NULL DEFAULT 'prompt',
		credential BLOB,
		created_at TEXT NOT NULL,
		updated_at TEXT NOT NULL
	)`)
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}

	store, err := Open(context.Background(), path, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })

	created, err := store.CreateAsset(context.Background(), assets.Input{
		Name: "console", Protocol: "vnc", Host: "127.0.0.1",
	})
	if err != nil {
		t.Fatal(err)
	}
	if created.Settings.VNC != nil {
		t.Fatalf("unexpected migrated VNC settings: %#v", created.Settings.VNC)
	}
}
