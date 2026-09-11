package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"net/http"
	"strings"
	"sync"
	"time"
)

const cookieName = "awsl_remotex_session"
const sessionLifetime = 30 * 24 * time.Hour

type Gate struct {
	username []byte
	password []byte
	mu       sync.Mutex
	sessions map[string]time.Time
}

func New(username, password string) *Gate {
	username = strings.TrimSpace(username)
	if username == "" {
		username = "admin"
	}
	password = strings.TrimSpace(password)
	return &Gate{username: []byte(username), password: []byte(password), sessions: make(map[string]time.Time)}
}

func (gate *Gate) Required() bool {
	return len(gate.password) > 0
}

func (gate *Gate) Authenticated(request *http.Request) bool {
	if !gate.Required() {
		return true
	}
	cookie, err := request.Cookie(cookieName)
	if err != nil {
		return false
	}
	gate.mu.Lock()
	defer gate.mu.Unlock()
	expires, ok := gate.sessions[cookie.Value]
	if !ok || !time.Now().Before(expires) {
		delete(gate.sessions, cookie.Value)
		return false
	}
	return true
}

func (gate *Gate) Login(writer http.ResponseWriter, request *http.Request, username, password string) bool {
	if !gate.Required() {
		return true
	}
	if !matches(username, gate.username) || !matches(password, gate.password) {
		return false
	}
	var random [32]byte
	if _, err := rand.Read(random[:]); err != nil {
		return false
	}
	token := base64.RawURLEncoding.EncodeToString(random[:])
	now := time.Now()
	gate.mu.Lock()
	for value, expires := range gate.sessions {
		if !now.Before(expires) {
			delete(gate.sessions, value)
		}
	}
	if cookie, err := request.Cookie(cookieName); err == nil {
		delete(gate.sessions, cookie.Value)
	}
	gate.sessions[token] = now.Add(sessionLifetime)
	gate.mu.Unlock()
	http.SetCookie(writer, &http.Cookie{
		Name:     cookieName,
		Value:    token,
		Path:     "/",
		MaxAge:   int(sessionLifetime.Seconds()),
		HttpOnly: true,
		Secure:   request.TLS != nil || strings.EqualFold(request.Header.Get("X-Forwarded-Proto"), "https"),
		SameSite: http.SameSiteStrictMode,
	})
	return true
}

func matches(value string, expected []byte) bool {
	return len(value) == len(expected) && subtle.ConstantTimeCompare([]byte(value), expected) == 1
}

func (gate *Gate) Logout(writer http.ResponseWriter, request *http.Request) {
	if cookie, err := request.Cookie(cookieName); err == nil {
		gate.mu.Lock()
		delete(gate.sessions, cookie.Value)
		gate.mu.Unlock()
	}
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
