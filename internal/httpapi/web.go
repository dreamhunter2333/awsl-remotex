package httpapi

import (
	"net/http"
	"os"
	"path/filepath"
)

func (server *Server) spa() http.Handler {
	files := http.FileServer(http.Dir(server.webDir))
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		path := filepath.Join(server.webDir, filepath.Clean(request.URL.Path))
		info, err := os.Stat(path)
		if err == nil && !info.IsDir() {
			files.ServeHTTP(writer, request)
			return
		}

		index := filepath.Join(server.webDir, "index.html")
		if _, err := os.Stat(index); err != nil {
			writeError(writer, http.StatusNotFound, "frontend has not been built")
			return
		}
		http.ServeFile(writer, request, index)
	})
}

func (server *Server) internalError(writer http.ResponseWriter, request *http.Request, err error) {
	server.logger.Error("request failed", "method", request.Method, "path", request.URL.Path, "error", err)
	writeError(writer, http.StatusInternalServerError, "internal server error")
}
