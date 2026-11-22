package httpapi

import (
	"fmt"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"

	"github.com/go-chi/chi/v5"
)

func parseGuacamoleUpstream(address string) (*url.URL, error) {
	if address == "" {
		return nil, nil
	}
	upstream, err := url.Parse(address)
	if err != nil {
		return nil, fmt.Errorf("parse GUACAMOLE_UPSTREAM: %w", err)
	}
	if (upstream.Scheme != "http" && upstream.Scheme != "https") || upstream.Hostname() == "" || upstream.Fragment != "" {
		return nil, fmt.Errorf("GUACAMOLE_UPSTREAM must be an HTTP or HTTPS URL")
	}
	return upstream, nil
}

func (server *Server) mountGuacamole(router chi.Router, upstream *url.URL) {
	proxy := httputil.NewSingleHostReverseProxy(upstream)
	proxy.ErrorHandler = func(writer http.ResponseWriter, request *http.Request, err error) {
		server.internalError(writer, request, fmt.Errorf("proxy guacamole: %w", err))
	}
	serveGuacamole := http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		request.Header.Del("Authorization")
		request.Header.Del("Cookie")
		proxy.ServeHTTP(writer, request)
	})
	httpHandler := server.auth.Require(serveGuacamole)
	router.Handle("/guacamole", httpHandler)
	router.Handle("/guacamole/*", httpHandler)
	router.Get("/guacamole/websocket-tunnel", server.guacamoleTunnel(serveGuacamole))
}

func (server *Server) guacamoleTunnel(proxy http.Handler) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		if !server.auth.Required() {
			proxy.ServeHTTP(writer, request)
			return
		}
		query := request.URL.Query()
		tickets := query["remotex_ticket"]
		if !strings.EqualFold(request.Header.Get("Upgrade"), "websocket") || len(tickets) != 1 {
			writeError(writer, http.StatusUnauthorized, "WebSocket authentication required")
			return
		}
		ctx, cancel := server.auth.ConsumeTunnel(request.Context(), tickets[0])
		if ctx == nil {
			writeError(writer, http.StatusUnauthorized, "WebSocket authentication required")
			return
		}
		defer cancel()
		query.Del("remotex_ticket")
		request.URL.RawQuery = query.Encode()
		proxy.ServeHTTP(writer, request.WithContext(ctx))
	}
}
