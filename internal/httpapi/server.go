package httpapi

import (
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httputil"
	"net/url"
	"time"

	"github.com/dreamhunter2333/awsl-remotex/internal/assets"
	"github.com/dreamhunter2333/awsl-remotex/internal/auth"
	"github.com/dreamhunter2333/awsl-remotex/internal/database"
	"github.com/dreamhunter2333/awsl-remotex/internal/guacamole"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

type Server struct {
	store              *database.Store
	assets             *assets.Service
	logger             *slog.Logger
	webDir             string
	guacd              *guacamole.Tester
	auth               *auth.Gate
	guacamoleUpstream  string
	sessionIdleTimeout time.Duration
}

type Config struct {
	WebDir             string
	GuacamoleUpstream  string
	AssetService       *assets.Service
	GuacdTester        *guacamole.Tester
	AuthUsername       string
	AuthPassword       string
	SessionIdleTimeout time.Duration
}

func New(store *database.Store, logger *slog.Logger, config Config) (http.Handler, error) {
	server := &Server{
		store:              store,
		assets:             config.AssetService,
		logger:             logger,
		webDir:             config.WebDir,
		guacd:              config.GuacdTester,
		auth:               auth.New(config.AuthUsername, config.AuthPassword),
		guacamoleUpstream:  config.GuacamoleUpstream,
		sessionIdleTimeout: config.SessionIdleTimeout,
	}
	if server.assets == nil {
		return nil, fmt.Errorf("asset service is required")
	}
	if server.sessionIdleTimeout <= 0 {
		server.sessionIdleTimeout = 24 * time.Hour
	}
	router := chi.NewRouter()
	router.Use(middleware.RequestID, middleware.RealIP, middleware.Recoverer)
	router.Get("/api/health", server.health)
	router.Get("/api/ready", server.ready)
	router.Get("/api/auth/status", server.authStatus)
	router.Post("/api/auth/login", server.login)
	router.Delete("/api/auth/session", server.logout)
	router.Group(func(router chi.Router) {
		router.Use(server.auth.Require)
		router.Get("/api/assets", server.listAssets)
		router.Post("/api/assets", server.createAsset)
		router.Post("/api/assets/test", server.testAssetInput)
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
