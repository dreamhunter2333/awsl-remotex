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

	"github.com/dreamhunter2333/awsl-remotex/internal/credential"
	"github.com/dreamhunter2333/awsl-remotex/internal/database"
	"github.com/dreamhunter2333/awsl-remotex/internal/guacamole"
	"github.com/dreamhunter2333/awsl-remotex/internal/httpapi"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	var vault *credential.Vault
	var err error
	if secret := os.Getenv("CREDENTIAL_KEY"); secret != "" {
		vault, err = credential.New(secret)
		if err != nil {
			logger.Error("configure credential vault", "error", err)
			os.Exit(1)
		}
	}

	store, err := database.Open(ctx, env("DATABASE_PATH", "data/awsl-remotex.db"), vault)
	if err != nil {
		logger.Error("open database", "error", err)
		os.Exit(1)
	}
	defer store.Close()

	var guacamoleAuth *guacamole.Authenticator
	if secret := os.Getenv("GUACAMOLE_JSON_SECRET"); secret != "" {
		guacamoleAuth, err = guacamole.New(secret, env("GUACAMOLE_PUBLIC_PATH", "/guacamole"))
		if err != nil {
			logger.Error("configure guacamole", "error", err)
			os.Exit(1)
		}
	}
	handler, err := httpapi.New(store, logger, httpapi.Config{
		WebDir:                 env("WEB_DIR", "web/dist"),
		GuacamoleUpstream:      os.Getenv("GUACAMOLE_UPSTREAM"),
		GuacamoleAuthenticator: guacamoleAuth,
		AuthPassword:           os.Getenv("AUTH_PASSWORD"),
	})
	if err != nil {
		logger.Error("configure server", "error", err)
		os.Exit(1)
	}

	server := &http.Server{
		Addr:              env("ADDR", ":8080"),
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

func env(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}
