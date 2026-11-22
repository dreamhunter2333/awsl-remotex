package auth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/synctest"
	"time"
)

func TestJWTAuthentication(t *testing.T) {
	gate := New("", "secret", false)
	if !gate.CheckPassword("admin", "secret") || gate.CheckPassword("admin", "wrong") || gate.CheckPassword("other", "secret") {
		t.Fatal("unexpected password validation")
	}
	token, err := gate.IssueSession("admin")
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodGet, "/api/assets", nil)
	request.AddCookie(&http.Cookie{Name: "awsl_remotex_session", Value: token})
	request.Header.Set("Remote-User", "admin")
	if gate.Authenticated(request) {
		t.Fatal("accepted a cookie or bare username")
	}
	request.Header.Set("Authorization", "Bearer "+token)
	if !gate.Authenticated(request) {
		t.Fatal("rejected signed JWT")
	}
	if New("", "secret", false).Authenticated(request) {
		t.Fatal("accepted a JWT from another process")
	}
	parts := strings.Split(token, ".")
	request.Header.Set("Authorization", "Bearer "+strings.Join([]string{parts[0], parts[1], "invalid"}, "."))
	if gate.Authenticated(request) {
		t.Fatal("accepted an invalid signature")
	}
	expired, err := gate.sign("admin", apiAudience, "", time.Now().Add(-time.Second))
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Authorization", "Bearer "+expired)
	if gate.Authenticated(request) {
		t.Fatal("accepted an expired JWT")
	}
	request.Header.Set("Authorization", "Bearer "+token)
	gate.Logout(request)
	if gate.Authenticated(request) {
		t.Fatal("accepted a revoked JWT")
	}
}

func TestTunnelJWTIsScopedAndSingleUse(t *testing.T) {
	gate := New("operator", "secret", false)
	session, err := gate.IssueSession("operator")
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api/auth/tunnel", nil)
	request.Header.Set("Authorization", "Bearer "+session)
	ticket, err := gate.IssueTunnel(request)
	if err != nil || ticket == "" {
		t.Fatalf("failed to issue tunnel ticket: %v", err)
	}
	request.Header.Set("Authorization", "Bearer "+ticket)
	if ctx, _ := gate.ConsumeTunnel(t.Context(), session); gate.Authenticated(request) || ctx != nil {
		t.Fatal("accepted a JWT with the wrong audience")
	}
	tunnel, cancel := gate.ConsumeTunnel(t.Context(), ticket)
	if tunnel == nil {
		t.Fatal("rejected an unused tunnel JWT")
	}
	defer cancel()
	if ctx, _ := gate.ConsumeTunnel(t.Context(), ticket); ctx != nil {
		t.Fatal("accepted a used tunnel JWT")
	}
	request.Header.Set("Authorization", "Bearer "+session)
	ticket, err = gate.IssueTunnel(request)
	if err != nil {
		t.Fatal(err)
	}
	gate.Logout(request)
	if ctx, _ := gate.ConsumeTunnel(t.Context(), ticket); ctx != nil {
		t.Fatal("accepted a tunnel JWT from a revoked session")
	}
	select {
	case <-tunnel.Done():
	case <-time.After(time.Second):
		t.Fatal("logout did not close the active tunnel")
	}
}

func TestTunnelExpiresWithParentSession(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		gate := New("operator", "secret", false)
		bearer, err := gate.sign("operator", apiAudience, "", time.Now().Add(2*time.Minute))
		if err != nil {
			t.Fatal(err)
		}
		request := httptest.NewRequest(http.MethodPost, "/api/auth/tunnel", nil)
		request.Header.Set("Authorization", "Bearer "+bearer)
		ticket, err := gate.IssueTunnel(request)
		if err != nil {
			t.Fatal(err)
		}
		tunnel, cancel := gate.ConsumeTunnel(context.Background(), ticket)
		if tunnel == nil {
			t.Fatal("could not start tunnel")
		}
		defer cancel()
		time.Sleep(tunnelLifetime)
		if tunnel.Err() != nil {
			t.Fatal("handshake ticket expiry closed the active tunnel")
		}
		time.Sleep(2*time.Minute - tunnelLifetime)
		synctest.Wait()
		if tunnel.Err() == nil {
			t.Fatal("session expiry did not close the active tunnel")
		}
	})
}

func TestAuthenticationRequiredForOIDCWithoutPassword(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	if New("", "", true).Authenticated(request) {
		t.Fatal("OIDC must require authentication")
	}
	if !New("", "", false).Authenticated(request) {
		t.Fatal("no credentials configured should allow requests")
	}
}
