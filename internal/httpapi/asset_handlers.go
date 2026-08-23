package httpapi

import (
	"errors"
	"net"
	"net/http"
	"strconv"
	"time"

	"github.com/dreamhunter2333/awsl-remotex/internal/database"
	"github.com/go-chi/chi/v5"
)

func (server *Server) listAssets(writer http.ResponseWriter, request *http.Request) {
	assets, err := server.store.ListAssets(request.Context())
	if err != nil {
		server.internalError(writer, request, err)
		return
	}
	writeJSON(writer, http.StatusOK, assets)
}

func (server *Server) createAsset(writer http.ResponseWriter, request *http.Request) {
	var input database.AssetInput
	if err := decodeJSON(request, &input); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	asset, err := server.store.CreateAsset(request.Context(), input)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusCreated, asset)
}

func (server *Server) updateAsset(writer http.ResponseWriter, request *http.Request) {
	var input database.AssetInput
	if err := decodeJSON(request, &input); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	asset, err := server.store.UpdateAsset(request.Context(), chi.URLParam(request, "id"), input)
	if errors.Is(err, database.ErrNotFound) {
		writeError(writer, http.StatusNotFound, "asset not found")
		return
	}
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, asset)
}

func (server *Server) deleteAsset(writer http.ResponseWriter, request *http.Request) {
	err := server.store.DeleteAsset(request.Context(), chi.URLParam(request, "id"))
	if errors.Is(err, database.ErrNotFound) {
		writeError(writer, http.StatusNotFound, "asset not found")
		return
	}
	if err != nil {
		server.internalError(writer, request, err)
		return
	}
	writer.WriteHeader(http.StatusNoContent)
}

func (server *Server) connectAsset(writer http.ResponseWriter, request *http.Request) {
	if server.guac == nil {
		writeError(writer, http.StatusServiceUnavailable, "Apache Guacamole is not configured")
		return
	}
	asset, err := server.store.GetAsset(request.Context(), chi.URLParam(request, "id"))
	if errors.Is(err, database.ErrNotFound) {
		writeError(writer, http.StatusNotFound, "asset not found")
		return
	}
	if err != nil {
		server.internalError(writer, request, err)
		return
	}
	credential, err := server.store.GetCredential(request.Context(), asset.ID)
	if err != nil {
		server.internalError(writer, request, err)
		return
	}
	connectionURL, expires, err := server.guac.ConnectionURL(asset, credential, request.URL.Query().Get("theme"))
	if err != nil {
		server.internalError(writer, request, err)
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"url": connectionURL, "expiresAt": expires})
}

func (server *Server) testAsset(writer http.ResponseWriter, request *http.Request) {
	asset, err := server.store.GetAsset(request.Context(), chi.URLParam(request, "id"))
	if errors.Is(err, database.ErrNotFound) {
		writeError(writer, http.StatusNotFound, "asset not found")
		return
	}
	if err != nil {
		server.internalError(writer, request, err)
		return
	}

	address := net.JoinHostPort(asset.Host, strconv.Itoa(asset.Port))
	started := time.Now()
	connection, err := net.DialTimeout("tcp", address, 5*time.Second)
	latency := time.Since(started).Milliseconds()
	if err != nil {
		writeJSON(writer, http.StatusOK, map[string]any{"reachable": false, "latencyMs": latency, "message": err.Error()})
		return
	}
	_ = connection.Close()
	writeJSON(writer, http.StatusOK, map[string]any{"reachable": true, "latencyMs": latency, "message": "TCP connection succeeded"})
}
