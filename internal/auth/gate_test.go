package auth

import (
	"net/http/httptest"
	"testing"
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

func TestDefaultUsernameAndDisabledAuthentication(t *testing.T) {
	gate := New("", "secret")
	if !gate.Login(httptest.NewRecorder(), httptest.NewRequest("POST", "/", nil), "admin", "secret") {
		t.Fatal("default admin username was rejected")
	}

	disabled := New("operator", "")
	if disabled.Required() {
		t.Fatal("authentication should be disabled without a password")
	}
}
