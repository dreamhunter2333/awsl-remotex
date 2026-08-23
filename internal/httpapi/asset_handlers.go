package httpapi

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/dreamhunter2333/awsl-remotex/internal/assets"
	"github.com/go-chi/chi/v5"
)

func (server *Server) listAssets(writer http.ResponseWriter, request *http.Request) {
	result, err := server.assets.List(request.Context())
	if err != nil {
		server.internalError(writer, request, err)
		return
	}
	writeJSON(writer, http.StatusOK, result)
}

func (server *Server) createAsset(writer http.ResponseWriter, request *http.Request) {
	var input assets.Input
	if err := decodeJSON(request, &input); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	asset, err := server.assets.Create(request.Context(), input)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusCreated, asset)
}

func (server *Server) updateAsset(writer http.ResponseWriter, request *http.Request) {
	var input assets.Input
	if err := decodeJSON(request, &input); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	asset, err := server.assets.Update(request.Context(), chi.URLParam(request, "id"), input)
	if errors.Is(err, assets.ErrNotFound) {
		writeError(writer, http.StatusNotFound, err.Error())
		return
	}
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, asset)
}

func (server *Server) deleteAsset(writer http.ResponseWriter, request *http.Request) {
	err := server.assets.Delete(request.Context(), chi.URLParam(request, "id"))
	if server.writeAssetError(writer, request, err) {
		return
	}
	writer.WriteHeader(http.StatusNoContent)
}

func (server *Server) connectAsset(writer http.ResponseWriter, request *http.Request) {
	connectionURL, expires, err := server.assets.Connect(request.Context(), chi.URLParam(request, "id"), request.URL.Query().Get("theme"))
	if server.writeAssetError(writer, request, err) {
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"url": connectionURL, "expiresAt": expires})
}

func (server *Server) testAsset(writer http.ResponseWriter, request *http.Request) {
	server.runConnectionTest(writer, request, func(ctx context.Context) error {
		return server.assets.TestSaved(ctx, chi.URLParam(request, "id"))
	})
}

func (server *Server) testAssetInput(writer http.ResponseWriter, request *http.Request) {
	var input struct {
		AssetID string       `json:"assetId"`
		Asset   assets.Input `json:"asset"`
	}
	if err := decodeJSON(request, &input); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	server.runConnectionTest(writer, request, func(ctx context.Context) error {
		return server.assets.TestInput(ctx, input.AssetID, input.Asset)
	})
}

func (server *Server) runConnectionTest(writer http.ResponseWriter, request *http.Request, test func(context.Context) error) {
	ctx, cancel := context.WithTimeout(request.Context(), 10*time.Second)
	defer cancel()
	started := time.Now()
	err := test(ctx)
	latency := time.Since(started).Milliseconds()
	if errors.Is(err, assets.ErrNotFound) {
		writeError(writer, http.StatusNotFound, err.Error())
		return
	}
	if err != nil {
		writeJSON(writer, http.StatusOK, map[string]any{"reachable": false, "latencyMs": latency, "message": err.Error()})
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"reachable": true, "latencyMs": latency, "message": "Guacamole connection succeeded"})
}

func (server *Server) writeAssetError(writer http.ResponseWriter, request *http.Request, err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, assets.ErrNotFound) {
		writeError(writer, http.StatusNotFound, err.Error())
		return true
	}
	server.internalError(writer, request, err)
	return true
}
