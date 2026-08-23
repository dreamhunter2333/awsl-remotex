package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"net/http"
	"strings"
	"time"
)

const cookieName = "awsl_remotex_session"

type Gate struct {
	password []byte
	token    string
}

func New(password string) *Gate {
	password = strings.TrimSpace(password)
	gate := &Gate{password: []byte(password)}
	if password == "" {
		return gate
	}
	mac := hmac.New(sha256.New, gate.password)
	_, _ = mac.Write([]byte("awsl-remotex-session-v1"))
	gate.token = base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return gate
}

func (gate *Gate) Required() bool {
	return len(gate.password) > 0
}

func (gate *Gate) Authenticated(request *http.Request) bool {
	if !gate.Required() {
		return true
	}
	cookie, err := request.Cookie(cookieName)
	if err != nil || len(cookie.Value) != len(gate.token) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(cookie.Value), []byte(gate.token)) == 1
}

func (gate *Gate) Login(writer http.ResponseWriter, request *http.Request, password string) bool {
	if gate.Required() && (len(password) != len(gate.password) || subtle.ConstantTimeCompare([]byte(password), gate.password) != 1) {
		return false
	}
	http.SetCookie(writer, &http.Cookie{
		Name:     cookieName,
		Value:    gate.token,
		Path:     "/",
		MaxAge:   int((7 * 24 * time.Hour).Seconds()),
		HttpOnly: true,
		Secure:   request.TLS != nil || strings.EqualFold(request.Header.Get("X-Forwarded-Proto"), "https"),
		SameSite: http.SameSiteStrictMode,
	})
	return true
}

func (gate *Gate) Logout(writer http.ResponseWriter) {
	http.SetCookie(writer, &http.Cookie{
		Name:     cookieName,
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
	})
}

func (gate *Gate) Require(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if !gate.Authenticated(request) {
			writer.Header().Set("Content-Type", "application/json; charset=utf-8")
			writer.WriteHeader(http.StatusUnauthorized)
			_, _ = writer.Write([]byte(`{"error":"authentication required"}`))
			return
		}
		next.ServeHTTP(writer, request)
	})
}
