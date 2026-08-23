package httpapi

import (
	"context"
	"net/http"
	"time"
)

func (server *Server) authStatus(writer http.ResponseWriter, request *http.Request) {
	writeJSON(writer, http.StatusOK, map[string]any{
		"required":           server.auth.Required(),
		"authenticated":      server.auth.Authenticated(request),
		"sessionIdleSeconds": int64(server.sessionIdleTimeout.Seconds()),
	})
}

func (server *Server) login(writer http.ResponseWriter, request *http.Request) {
	var input struct {
		Password string `json:"password"`
	}
	if err := decodeJSON(request, &input); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	if !server.auth.Login(writer, request, input.Password) {
		writeError(writer, http.StatusUnauthorized, "invalid password")
		return
	}
	writer.WriteHeader(http.StatusNoContent)
}

func (server *Server) logout(writer http.ResponseWriter, _ *http.Request) {
	server.auth.Logout(writer)
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
	if response.StatusCode >= http.StatusInternalServerError {
		writeError(writer, http.StatusServiceUnavailable, "Guacamole unavailable")
		return
	}
	writeJSON(writer, http.StatusOK, map[string]string{"status": "ready"})
}
