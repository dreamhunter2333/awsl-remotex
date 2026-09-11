package httpapi

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"testing"
	"time"

	"github.com/dreamhunter2333/awsl-remotex/internal/auth"
	"github.com/dreamhunter2333/awsl-remotex/internal/database"
	"github.com/dreamhunter2333/awsl-remotex/internal/guacamole"
)

func TestLogoutRevokesCookie(t *testing.T) {
	server := &Server{auth: auth.New("operator", "secret")}
	login := httptest.NewRecorder()
	server.auth.Login(login, httptest.NewRequest("POST", "/", nil), "operator", "secret")
	request := httptest.NewRequest("DELETE", "/api/auth/session", nil)
	request.AddCookie(login.Result().Cookies()[0])
	response := httptest.NewRecorder()
	server.logout(response, request)
	if response.Code != http.StatusNoContent || response.Result().Cookies()[0].MaxAge != -1 {
		t.Fatalf("unexpected logout response: %v", response.Result())
	}
	if server.auth.Authenticated(request) {
		t.Fatal("logout handler did not revoke the session")
	}
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
