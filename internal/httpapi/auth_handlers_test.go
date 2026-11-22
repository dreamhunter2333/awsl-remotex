package httpapi

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/dreamhunter2333/awsl-remotex/internal/assets"
	"github.com/dreamhunter2333/awsl-remotex/internal/database"
	"github.com/dreamhunter2333/awsl-remotex/internal/guacamole"
)

func TestJWTProtectsAssetsAndGuacamole(t *testing.T) {
	store, err := database.Open(context.Background(), filepath.Join(t.TempDir(), "test.db"), nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	upstream := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Header.Get("Authorization") != "" || request.Header.Get("Cookie") != "" || request.URL.Query().Has("remotex_ticket") {
			t.Error("RemoteX credentials were forwarded to Guacamole")
		}
		if request.URL.Path == "/guacamole/websocket-tunnel" && request.URL.Query().Get("token") != "guac-token" {
			t.Error("Guacamole token did not reach the tunnel")
		}
		writer.WriteHeader(http.StatusNoContent)
	}))
	t.Cleanup(upstream.Close)
	router, err := New(store, slog.New(slog.NewTextHandler(io.Discard, nil)), Config{
		AssetService: assets.NewService(store, nil, nil), AuthUsername: "operator",
		AuthPassword: "secret", GuacamoleUpstream: upstream.URL,
	})
	if err != nil {
		t.Fatal(err)
	}
	request := func(method, path, bearer, body string, upgrade bool) *httptest.ResponseRecorder {
		t.Helper()
		input := httptest.NewRequest(method, path, strings.NewReader(body))
		input.AddCookie(&http.Cookie{Name: "awsl_remotex_session", Value: bearer})
		if bearer != "" {
			input.Header.Set("Authorization", "Bearer "+bearer)
		}
		if upgrade {
			input.Header.Set("Connection", "Upgrade")
			input.Header.Set("Upgrade", "websocket")
		}
		response := httptest.NewRecorder()
		router.ServeHTTP(response, input)
		if response.Header().Get("Set-Cookie") != "" {
			t.Error("authentication set a cookie")
		}
		return response
	}
	expectStatus := func(response *httptest.ResponseRecorder, status int) {
		t.Helper()
		if response.Code != status {
			t.Fatalf("got HTTP %d, want %d: %s", response.Code, status, response.Body.String())
		}
	}
	readToken := func(response *httptest.ResponseRecorder) string {
		t.Helper()
		expectStatus(response, http.StatusOK)
		var result struct{ Token string }
		if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil || result.Token == "" {
			t.Fatalf("expected a JWT: %v", err)
		}
		return result.Token
	}
	expectStatus(request("GET", "/api/assets", "", "", false), http.StatusUnauthorized)
	expectStatus(request("POST", "/guacamole/api/tokens", "", "", false), http.StatusUnauthorized)
	const tunnel = "/guacamole/websocket-tunnel?token=guac-token"
	expectStatus(request("GET", tunnel, "", "", true), http.StatusUnauthorized)

	token := readToken(request("POST", "/api/auth/login", "", `{"username":"operator","password":"secret"}`, false))
	expectStatus(request("GET", "/api/assets", token, "", false), http.StatusOK)
	expectStatus(request("POST", "/guacamole/api/tokens", token, "", false), http.StatusNoContent)
	expectStatus(request("GET", tunnel+"&remotex_ticket="+token, "", "", true), http.StatusUnauthorized)
	ticket := readToken(request("POST", "/api/auth/tunnel", token, "", false))
	expectStatus(request("GET", "/api/assets", ticket, "", false), http.StatusUnauthorized)
	expectStatus(request("GET", tunnel+"&remotex_ticket="+ticket, "", "", true), http.StatusNoContent)
	expectStatus(request("GET", tunnel+"&remotex_ticket="+ticket, "", "", true), http.StatusUnauthorized)
	expectStatus(request("DELETE", "/api/auth/session", token, "", false), http.StatusNoContent)
	expectStatus(request("GET", "/api/assets", token, "", false), http.StatusUnauthorized)
}

func TestReadyRequiresSuccessfulGuacamoleResponse(t *testing.T) {
	store, err := database.Open(context.Background(), filepath.Join(t.TempDir(), "test.db"), nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = listener.Close() })
	go func() {
		for {
			connection, err := listener.Accept()
			if err != nil {
				return
			}
			_ = connection.Close()
		}
	}()
	for _, status := range []int{200, 204, 302, 401, 403, 404, 500, 503} {
		t.Run(strconv.Itoa(status), func(t *testing.T) {
			upstream := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
				if request.URL.Path != "/guacamole/" {
					t.Errorf("unexpected probe path: %s", request.URL.Path)
				}
				writer.WriteHeader(status)
			}))
			defer upstream.Close()
			server := &Server{store: store, guacd: guacamole.NewTester(listener.Addr().String(), time.Second), guacamoleUpstream: upstream.URL}
			response := httptest.NewRecorder()
			server.ready(response, httptest.NewRequest("GET", "/api/ready", nil))
			want := http.StatusServiceUnavailable
			if status == http.StatusOK {
				want = http.StatusOK
			}
			if response.Code != want {
				t.Fatalf("got %d, want %d", response.Code, want)
			}
		})
	}
}
