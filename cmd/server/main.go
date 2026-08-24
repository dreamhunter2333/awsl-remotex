package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/dreamhunter2333/awsl-remotex/internal/assets"
	"github.com/dreamhunter2333/awsl-remotex/internal/config"
	"github.com/dreamhunter2333/awsl-remotex/internal/credential"
	"github.com/dreamhunter2333/awsl-remotex/internal/database"
	"github.com/dreamhunter2333/awsl-remotex/internal/guacamole"
	"github.com/dreamhunter2333/awsl-remotex/internal/httpapi"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	settings, err := config.Load()
	if err != nil {
		logger.Error("load configuration", "error", err)
		os.Exit(1)
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	var vault *credential.Vault
	if secret := settings.CredentialKey; secret != "" {
		vault, err = credential.New(secret)
		if err != nil {
			logger.Error("configure credential vault", "error", err)
			os.Exit(1)
		}
	}

	store, err := database.Open(ctx, settings.DatabasePath, vault)
	if err != nil {
		logger.Error("open database", "error", err)
		os.Exit(1)
	}
	defer store.Close()

	var guacamoleAuth *guacamole.Authenticator
	if secret := settings.GuacamoleJSONSecret; secret != "" {
		guacamoleAuth, err = guacamole.New(secret, settings.GuacamolePublicPath)
		if err != nil {
			logger.Error("configure guacamole", "error", err)
			os.Exit(1)
		}
	}
	guacdTester := guacamole.NewTester(settings.GuacdAddress, 5*time.Second)
	assetService := assets.NewService(store, guacamoleAuth, guacdTester)
	handler, err := httpapi.New(store, logger, httpapi.Config{
		WebDir:             settings.WebDirectory,
		GuacamoleUpstream:  settings.GuacamoleUpstream,
		AssetService:       assetService,
		GuacdTester:        guacdTester,
		AuthUsername:       settings.AuthUsername,
		AuthPassword:       settings.AuthPassword,
		SessionIdleTimeout: settings.SessionIdleTimeout,
	})
	if err != nil {
		logger.Error("configure server", "error", err)
		os.Exit(1)
	}

	server := &http.Server{
		Addr:              settings.Address,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       90 * time.Second,
	}

	go func() {
		logger.Info("server started", "address", server.Addr)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("serve", "error", err)
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		logger.Error("shutdown", "error", err)
	}
}
