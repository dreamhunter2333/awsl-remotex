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
	username []byte
	password []byte
	token    string
}

func New(username, password string) *Gate {
	username = strings.TrimSpace(username)
	if username == "" {
		username = "admin"
	}
	password = strings.TrimSpace(password)
	gate := &Gate{username: []byte(username), password: []byte(password)}
	if password == "" {
		return gate
	}
	mac := hmac.New(sha256.New, gate.password)
	_, _ = mac.Write([]byte("awsl-remotex-session-v2\x00"))
	_, _ = mac.Write(gate.username)
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

func (gate *Gate) Login(writer http.ResponseWriter, request *http.Request, username, password string) bool {
	if gate.Required() && (!matches(username, gate.username) || !matches(password, gate.password)) {
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

func matches(value string, expected []byte) bool {
	return len(value) == len(expected) && subtle.ConstantTimeCompare([]byte(value), expected) == 1
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
