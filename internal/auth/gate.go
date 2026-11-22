package auth

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	issuer          = "awsl-remotex"
	apiAudience     = "awsl-remotex-api"
	tunnelAudience  = "awsl-remotex-tunnel"
	sessionLifetime = 8 * time.Hour
	tunnelLifetime  = 30 * time.Second
)

type claims struct {
	jwt.RegisteredClaims
	SessionID string `json:"sid,omitempty"`
}

type sessionRecord struct {
	expires time.Time
	ctx     context.Context
	cancel  context.CancelFunc
}

type Gate struct {
	username []byte
	password []byte
	required bool
	key      []byte
	mu       sync.Mutex
	sessions map[string]sessionRecord
}

func New(username, password string, oidcEnabled bool) *Gate {
	username = strings.TrimSpace(username)
	if username == "" {
		username = "admin"
	}
	password = strings.TrimSpace(password)
	key := make([]byte, 32)
	rand.Read(key)
	return &Gate{
		username: []byte(username),
		password: []byte(password),
		required: password != "" || oidcEnabled,
		key:      key,
		sessions: make(map[string]sessionRecord),
	}
}

func (gate *Gate) Required() bool {
	return gate.required
}

func (gate *Gate) CheckPassword(username, password string) bool {
	return len(gate.password) > 0 &&
		subtle.ConstantTimeCompare([]byte(username), gate.username) == 1 &&
		subtle.ConstantTimeCompare([]byte(password), gate.password) == 1
}

func (gate *Gate) IssueSession(subject string) (string, error) {
	return gate.sign(subject, apiAudience, "", time.Now().Add(sessionLifetime))
}

func (gate *Gate) IssueTunnel(request *http.Request) (string, error) {
	session := gate.activeSession(request)
	if session == nil {
		return "", nil
	}
	expires := time.Now().Add(tunnelLifetime)
	if session.ExpiresAt.Time.Before(expires) {
		expires = session.ExpiresAt.Time
	}
	return gate.sign(session.Subject, tunnelAudience, session.ID, expires)
}

func (gate *Gate) sign(subject, audience, sessionID string, expires time.Time) (string, error) {
	now := time.Now()
	tokenClaims := claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    issuer,
			Audience:  jwt.ClaimStrings{audience},
			Subject:   subject,
			ID:        rand.Text(),
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(expires),
		},
		SessionID: sessionID,
	}
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, tokenClaims).SignedString(gate.key)
	if err != nil {
		return "", err
	}

	record := sessionRecord{expires: tokenClaims.ExpiresAt.Time}
	if audience == apiAudience {
		record.ctx, record.cancel = context.WithDeadline(context.Background(), record.expires)
	}
	gate.mu.Lock()
	defer gate.mu.Unlock()
	for id, previous := range gate.sessions {
		if !now.Before(previous.expires) {
			if previous.cancel != nil {
				previous.cancel()
			}
			delete(gate.sessions, id)
		}
	}
	gate.sessions[tokenClaims.ID] = record
	return token, nil
}

func bearer(request *http.Request) string {
	values := request.Header.Values("Authorization")
	if len(values) != 1 {
		return ""
	}
	scheme, token, _ := strings.Cut(values[0], " ")
	if !strings.EqualFold(scheme, "Bearer") {
		return ""
	}
	return token
}

func (gate *Gate) verify(raw, audience string) *claims {
	if raw == "" {
		return nil
	}
	var tokenClaims claims
	_, err := jwt.ParseWithClaims(raw, &tokenClaims, func(*jwt.Token) (any, error) {
		return gate.key, nil
	}, jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}), jwt.WithIssuer(issuer),
		jwt.WithAudience(audience), jwt.WithExpirationRequired(), jwt.WithIssuedAt())
	if err != nil || tokenClaims.ID == "" || tokenClaims.Subject == "" {
		return nil
	}
	return &tokenClaims
}

func (gate *Gate) Authenticated(request *http.Request) bool {
	return !gate.Required() || gate.activeSession(request) != nil
}

func (gate *Gate) SessionExpiry(request *http.Request) time.Time {
	if session := gate.activeSession(request); session != nil {
		return session.ExpiresAt.Time
	}
	return time.Time{}
}

func (gate *Gate) activeSession(request *http.Request) *claims {
	session := gate.verify(bearer(request), apiAudience)
	if session == nil {
		return nil
	}
	gate.mu.Lock()
	defer gate.mu.Unlock()
	if !time.Now().Before(gate.sessions[session.ID].expires) {
		return nil
	}
	return session
}

func (gate *Gate) ConsumeTunnel(ctx context.Context, raw string) (context.Context, context.CancelFunc) {
	token := gate.verify(raw, tunnelAudience)
	if token == nil {
		return nil, nil
	}
	gate.mu.Lock()
	defer gate.mu.Unlock()
	now := time.Now()
	session := gate.sessions[token.SessionID]
	if !now.Before(gate.sessions[token.ID].expires) || !now.Before(session.expires) {
		return nil, nil
	}
	delete(gate.sessions, token.ID)
	tunnel, cancel := context.WithCancel(ctx)
	stop := context.AfterFunc(session.ctx, cancel)
	return tunnel, func() {
		stop()
		cancel()
	}
}

func (gate *Gate) Logout(request *http.Request) {
	session := gate.verify(bearer(request), apiAudience)
	if session == nil {
		return
	}
	gate.mu.Lock()
	defer gate.mu.Unlock()
	if record := gate.sessions[session.ID]; record.cancel != nil {
		record.cancel()
	}
	delete(gate.sessions, session.ID)
}

func (gate *Gate) Require(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if !gate.Authenticated(request) {
			writer.Header().Set("Content-Type", "application/json; charset=utf-8")
			writer.Header().Set("WWW-Authenticate", "Bearer")
			writer.WriteHeader(http.StatusUnauthorized)
			_, _ = writer.Write([]byte(`{"error":"authentication required"}`))
			return
		}
		next.ServeHTTP(writer, request)
	})
}
