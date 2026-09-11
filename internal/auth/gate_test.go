package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestLoginRequiresUsernameAndPassword(t *testing.T) {
	gate := New("operator", "secret")

	for _, credentials := range [][2]string{{"operator", "wrong"}, {"wrong", "secret"}} {
		response := httptest.NewRecorder()
		if gate.Login(response, httptest.NewRequest("POST", "/", nil), credentials[0], credentials[1]) {
			t.Fatalf("accepted credentials %q", credentials)
		}
	}

	response := httptest.NewRecorder()
	request := httptest.NewRequest("POST", "/", nil)
	if !gate.Login(response, request, "operator", "secret") {
		t.Fatal("rejected valid credentials")
	}
	cookies := response.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("got %d cookies, want 1", len(cookies))
	}
	request.AddCookie(cookies[0])
	if !gate.Authenticated(request) {
		t.Fatal("session cookie was not authenticated")
	}
}

func TestSessionRevocationAndExpiry(t *testing.T) {
	gate := New("operator", "secret")
	login := func() *http.Request {
		t.Helper()
		response := httptest.NewRecorder()
		if !gate.Login(response, httptest.NewRequest("POST", "/", nil), "operator", "secret") {
			t.Fatal("login failed")
		}
		request := httptest.NewRequest("GET", "/", nil)
		request.AddCookie(response.Result().Cookies()[0])
		return request
	}
	first, second := login(), login()
	firstCookie, _ := first.Cookie(cookieName)
	secondCookie, _ := second.Cookie(cookieName)
	if firstCookie.Value == secondCookie.Value {
		t.Fatal("independent logins reused the same token")
	}
	gate.Logout(httptest.NewRecorder(), first)
	if gate.Authenticated(first) {
		t.Fatal("revoked cookie was accepted")
	}
	if !gate.Authenticated(second) {
		t.Fatal("logout revoked another session")
	}
	if New("operator", "secret").Authenticated(second) {
		t.Fatal("new server accepted an old session")
	}
	gate.sessions[secondCookie.Value] = time.Now().Add(-time.Second)
	if gate.Authenticated(second) {
		t.Fatal("expired cookie was accepted")
	}
	if len(gate.sessions) != 0 {
		t.Fatal("expired session was not removed")
	}
}

func TestDefaultUsernameAndDisabledAuthentication(t *testing.T) {
	gate := New("", "secret")
	if !gate.Login(httptest.NewRecorder(), httptest.NewRequest("POST", "/", nil), "admin", "secret") {
		t.Fatal("default admin username was rejected")
	}

	disabled := New("operator", "")
	if disabled.Required() {
		t.Fatal("authentication should be disabled without a password")
	}
	response := httptest.NewRecorder()
	if !disabled.Login(response, httptest.NewRequest("POST", "/", nil), "", "") || len(disabled.sessions) != 0 || len(response.Result().Cookies()) != 0 {
		t.Fatal("disabled authentication should not allocate sessions")
	}
}
