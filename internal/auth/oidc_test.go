package auth

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/oauth2"
)

func TestOIDCRejectsInsecureDiscoveryRedirect(t *testing.T) {
	plain := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		t.Error("OIDC discovery made an unencrypted request")
	}))
	defer plain.Close()
	issuer := httptest.NewTLSServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		http.Redirect(writer, request, plain.URL, http.StatusTemporaryRedirect)
	}))
	defer issuer.Close()

	_, err := NewOIDC(oidc.ClientContext(t.Context(), issuer.Client()), OIDCConfig{
		Issuer: issuer.URL, ClientID: "remotex", ClientSecret: "client-secret",
		RedirectURL: "https://remotex.example.test/auth/callback",
	})
	if err == nil || !strings.Contains(err.Error(), "OIDC redirects must use HTTPS") {
		t.Fatalf("expected HTTPS redirect error, got %v", err)
	}
}

func TestOIDCVerifiesProviderJWTAndPKCE(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	const clientID, clientSecret = "remotex", "client-secret"
	var issuer string
	var nonce, challenge string
	provider := httptest.NewTLSServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		var body any
		switch request.URL.Path {
		case "/.well-known/openid-configuration":
			body = map[string]any{
				"issuer": issuer, "authorization_endpoint": issuer + "/authorize",
				"token_endpoint": issuer + "/token", "jwks_uri": issuer + "/jwks",
				"id_token_signing_alg_values_supported": []string{"RS256"},
			}
		case "/jwks":
			body = map[string]any{"keys": []map[string]string{{
				"kty": "RSA", "kid": "test-key", "alg": "RS256", "use": "sig",
				"n": base64.RawURLEncoding.EncodeToString(key.N.Bytes()), "e": "AQAB",
			}}}
		case "/token":
			if err := request.ParseForm(); err != nil {
				t.Error(err)
				writer.WriteHeader(http.StatusBadRequest)
				return
			}
			id, secret, _ := request.BasicAuth()
			if id != clientID || secret != clientSecret || oauth2.S256ChallengeFromVerifier(request.Form.Get("code_verifier")) != challenge {
				writer.WriteHeader(http.StatusUnauthorized)
				return
			}
			audience := clientID
			if request.Form.Get("code") == "wrong-audience" {
				audience = "another-app"
			}
			token := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{
				"iss": issuer, "sub": "alice", "aud": audience, "nonce": nonce,
				"iat": time.Now().Unix(), "exp": time.Now().Add(time.Minute).Unix(),
			})
			token.Header["kid"] = "test-key"
			signed, err := token.SignedString(key)
			if err != nil {
				t.Error(err)
				writer.WriteHeader(http.StatusInternalServerError)
				return
			}
			body = map[string]string{"access_token": "oidc-access-token", "token_type": "Bearer", "id_token": signed}
		default:
			writer.WriteHeader(http.StatusNotFound)
			return
		}
		if err := json.NewEncoder(writer).Encode(body); err != nil {
			t.Error(err)
		}
	}))
	defer provider.Close()
	issuer = provider.URL

	client, err := NewOIDC(oidc.ClientContext(context.Background(), provider.Client()), OIDCConfig{
		Issuer: issuer, ClientID: clientID, ClientSecret: clientSecret,
		RedirectURL: "https://remotex.example.test/auth/callback",
	})
	if err != nil {
		t.Fatal(err)
	}
	start := client.Start()
	authorization, err := url.Parse(start.URL)
	if err != nil {
		t.Fatal(err)
	}
	query := authorization.Query()
	nonce, challenge = query.Get("nonce"), query.Get("code_challenge")
	if nonce != start.Nonce || query.Get("state") != start.State || query.Get("code_challenge_method") != "S256" ||
		challenge != oauth2.S256ChallengeFromVerifier(start.Verifier) || query.Get("client_secret") != "" {
		t.Fatalf("unexpected authorization URL: %s", start.URL)
	}
	subject, err := client.Exchange(context.Background(), "valid", start.Verifier, start.Nonce)
	if err != nil || subject != "alice" {
		t.Fatalf("got subject %q with error %v", subject, err)
	}
	for _, input := range [][3]string{
		{"wrong-audience", start.Verifier, start.Nonce},
		{"valid", start.Verifier, "wrong-nonce"},
		{"valid", "wrong-verifier", start.Nonce},
	} {
		if _, err := client.Exchange(context.Background(), input[0], input[1], input[2]); err == nil {
			t.Errorf("accepted invalid exchange %v", input[0])
		}
	}
}
