package httpapi

import "net/http"

func (server *Server) authStatus(writer http.ResponseWriter, request *http.Request) {
	writeJSON(writer, http.StatusOK, map[string]bool{
		"required":      server.auth.Required(),
		"authenticated": server.auth.Authenticated(request),
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
