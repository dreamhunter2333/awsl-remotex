package httpapi

import (
	"context"
	"net/http"
	"time"
)

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
	if server.guacamoleUpstream == nil {
		writeError(writer, http.StatusServiceUnavailable, "Guacamole unavailable")
		return
	}
	probe, err := http.NewRequestWithContext(ctx, http.MethodGet, server.guacamoleUpstream.JoinPath("guacamole/").String(), nil)
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
