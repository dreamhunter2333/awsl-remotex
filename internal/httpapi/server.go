package httpapi

import (
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httputil"
	"net/url"

	"github.com/dreamhunter2333/awsl-remotex/internal/auth"
	"github.com/dreamhunter2333/awsl-remotex/internal/database"
	"github.com/dreamhunter2333/awsl-remotex/internal/guacamole"
	"github.com/go-chi/chi/v5"
)

type Server struct {
	store  *database.Store
	logger *slog.Logger
	webDir string
	guac   *guacamole.Authenticator
	auth   *auth.Gate
}

type Config struct {
	WebDir                 string
	GuacamoleUpstream      string
	GuacamoleAuthenticator *guacamole.Authenticator
	AuthPassword           string
}

func New(store *database.Store, logger *slog.Logger, config Config) (http.Handler, error) {
	server := &Server{
		store:  store,
		logger: logger,
		webDir: config.WebDir,
		guac:   config.GuacamoleAuthenticator,
		auth:   auth.New(config.AuthPassword),
	}
	router := chi.NewRouter()
	router.Get("/api/health", server.health)
	router.Get("/api/auth/status", server.authStatus)
	router.Post("/api/auth/login", server.login)
	router.Delete("/api/auth/session", server.logout)
	router.Group(func(router chi.Router) {
		router.Use(server.auth.Require)
		router.Get("/api/assets", server.listAssets)
		router.Post("/api/assets", server.createAsset)
		router.Put("/api/assets/{id}", server.updateAsset)
		router.Delete("/api/assets/{id}", server.deleteAsset)
		router.Post("/api/assets/{id}/connect", server.connectAsset)
		router.Post("/api/assets/{id}/test", server.testAsset)
	})

	if config.GuacamoleUpstream != "" {
		upstream, err := url.Parse(config.GuacamoleUpstream)
		if err != nil {
			return nil, fmt.Errorf("parse GUACAMOLE_UPSTREAM: %w", err)
		}
		proxy := httputil.NewSingleHostReverseProxy(upstream)
		proxy.ErrorHandler = func(writer http.ResponseWriter, request *http.Request, err error) {
			server.internalError(writer, request, fmt.Errorf("proxy guacamole: %w", err))
		}
		router.Handle("/guacamole", server.auth.Require(proxy))
		router.Handle("/guacamole/*", server.auth.Require(proxy))
	}

	router.Handle("/*", server.spa())
	return router, nil
}
