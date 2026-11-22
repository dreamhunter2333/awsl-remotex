package httpapi

import (
	"context"
	"net/http"
	"time"
)

func authRequest(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Cache-Control", "no-store")
		writer.Header().Add("Vary", "Sec-Fetch-Site")
		switch request.Header.Get("Sec-Fetch-Site") {
		case "", "same-origin", "none":
			next.ServeHTTP(writer, request)
		default:
			writeError(writer, http.StatusForbidden, "cross-origin authentication request")
		}
	})
}

func (server *Server) authStatus(writer http.ResponseWriter, request *http.Request) {
	expires := server.auth.SessionExpiry(request)
	status := map[string]any{
		"required":           server.auth.Required(),
		"authenticated":      !server.auth.Required() || !expires.IsZero(),
		"oidc":               server.oidc != nil,
		"sessionIdleSeconds": int64(server.sessionIdleTimeout.Seconds()),
	}
	if !expires.IsZero() {
		status["sessionExpiresInMs"] = max(0, time.Until(expires).Milliseconds())
	}
	writeJSON(writer, http.StatusOK, status)
}

func (server *Server) login(writer http.ResponseWriter, request *http.Request) {
	if server.oidc != nil {
		writeError(writer, http.StatusNotFound, "password login unavailable")
		return
	}
	var input struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := decodeJSON(request, &input); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	if !server.auth.Required() {
		writer.WriteHeader(http.StatusNoContent)
		return
	}
	if !server.auth.CheckPassword(input.Username, input.Password) {
		writeError(writer, http.StatusUnauthorized, "invalid credentials")
		return
	}
	server.issueSession(writer, request, input.Username)
}

func (server *Server) startOIDC(writer http.ResponseWriter, request *http.Request) {
	if server.oidc == nil {
		writeError(writer, http.StatusNotFound, "OIDC login unavailable")
		return
	}
	writeJSON(writer, http.StatusOK, server.oidc.Start())
}

func (server *Server) exchangeOIDC(writer http.ResponseWriter, request *http.Request) {
	if server.oidc == nil {
		writeError(writer, http.StatusNotFound, "OIDC login unavailable")
		return
	}
	var input struct {
		Code     string `json:"code"`
		Verifier string `json:"verifier"`
		Nonce    string `json:"nonce"`
	}
	if err := decodeJSON(request, &input); err != nil || input.Code == "" || input.Verifier == "" || input.Nonce == "" {
		writeError(writer, http.StatusBadRequest, "invalid OIDC callback")
		return
	}
	ctx, cancel := context.WithTimeout(request.Context(), 10*time.Second)
	defer cancel()
	subject, err := server.oidc.Exchange(ctx, input.Code, input.Verifier, input.Nonce)
	if err != nil {
		writeError(writer, http.StatusUnauthorized, "OIDC authentication failed")
		return
	}
	server.issueSession(writer, request, subject)
}

func (server *Server) issueSession(writer http.ResponseWriter, request *http.Request, subject string) {
	token, err := server.auth.IssueSession(subject)
	if err != nil {
		server.internalError(writer, request, err)
		return
	}
	server.auth.Logout(request)
	writeJSON(writer, http.StatusOK, map[string]string{"token": token})
}

func (server *Server) issueTunnel(writer http.ResponseWriter, request *http.Request) {
	if !server.auth.Required() {
		writer.WriteHeader(http.StatusNoContent)
		return
	}
	token, err := server.auth.IssueTunnel(request)
	if err != nil {
		server.internalError(writer, request, err)
		return
	}
	if token == "" {
		writer.Header().Set("WWW-Authenticate", "Bearer")
		writeError(writer, http.StatusUnauthorized, "authentication required")
		return
	}
	writeJSON(writer, http.StatusOK, map[string]string{"token": token})
}

func (server *Server) logout(writer http.ResponseWriter, request *http.Request) {
	server.auth.Logout(request)
	writer.WriteHeader(http.StatusNoContent)
}

func (server *Server) health(writer http.ResponseWriter, _ *http.Request) {
	writeJSON(writer, http.StatusOK, map[string]string{"status": "ok"})
}

func (server *Server) ready(writer http.ResponseWriter, request *http.Request) {
	ctx, cancel := context.WithTimeout(request.Context(), 3*time.Second)
	defer cancel()
	if err := server.store.Ping(ctx); err != nil {
		writeError(writer, http.StatusServiceUnavailable, "database unavailable")
		return
	}
	if err := server.guacd.Ping(ctx); err != nil {
		writeError(writer, http.StatusServiceUnavailable, "guacd unavailable")
		return
	}
	if server.guacamoleUpstream == "" {
		writeError(writer, http.StatusServiceUnavailable, "Guacamole unavailable")
		return
	}
	probe, err := http.NewRequestWithContext(ctx, http.MethodGet, server.guacamoleUpstream+"/guacamole/", nil)
	if err != nil {
		writeError(writer, http.StatusServiceUnavailable, "Guacamole unavailable")
		return
	}
	response, err := http.DefaultClient.Do(probe)
	if err != nil {
		writeError(writer, http.StatusServiceUnavailable, "Guacamole unavailable")
		return
	}
	_ = response.Body.Close()
	if response.StatusCode != http.StatusOK {
		writeError(writer, http.StatusServiceUnavailable, "Guacamole unavailable")
		return
	}
	writeJSON(writer, http.StatusOK, map[string]string{"status": "ready"})
}
