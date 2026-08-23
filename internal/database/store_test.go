package database

import (
	"context"
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
