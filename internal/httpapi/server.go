package httpapi

import (
	"fmt"
	"log/slog"
	"net/http"
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
	oidc               *auth.OIDC
	guacamoleUpstream  *url.URL
	sessionIdleTimeout time.Duration
}

type Config struct {
	WebDir             string
	GuacamoleUpstream  string
	AssetService       *assets.Service
	GuacdTester        *guacamole.Tester
	AuthUsername       string
	AuthPassword       string
	OIDC               *auth.OIDC
	SessionIdleTimeout time.Duration
}

func New(store *database.Store, logger *slog.Logger, config Config) (http.Handler, error) {
	upstream, err := parseGuacamoleUpstream(config.GuacamoleUpstream)
	if err != nil {
		return nil, err
	}
	server := &Server{
		store:              store,
		assets:             config.AssetService,
		logger:             logger,
		webDir:             config.WebDir,
		guacd:              config.GuacdTester,
		auth:               auth.New(config.AuthUsername, config.AuthPassword, config.OIDC != nil),
		oidc:               config.OIDC,
		guacamoleUpstream:  upstream,
		sessionIdleTimeout: config.SessionIdleTimeout,
	}
	if server.assets == nil {
		return nil, fmt.Errorf("asset service is required")
	}
	if server.sessionIdleTimeout <= 0 {
		server.sessionIdleTimeout = 24 * time.Hour
	}
	router := chi.NewRouter()
	router.Use(middleware.RequestID, middleware.Recoverer)
	router.Get("/api/health", server.health)
	router.Get("/api/ready", server.ready)
	router.Route("/api/auth", func(router chi.Router) {
		router.Use(authRequest)
		router.Get("/status", server.authStatus)
		router.Post("/login", server.login)
		router.Delete("/session", server.logout)
		router.Post("/oidc/start", server.startOIDC)
		router.Post("/oidc/exchange", server.exchangeOIDC)
		router.Post("/tunnel", server.issueTunnel)
	})
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

	if upstream != nil {
		server.mountGuacamole(router, upstream)
	}

	spa := server.spa()
	router.Get("/auth/callback", func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Cache-Control", "no-store")
		writer.Header().Set("Referrer-Policy", "no-referrer")
		spa.ServeHTTP(writer, request)
	})
	router.Handle("/*", spa)
	return router, nil
}
