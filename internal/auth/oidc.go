package auth

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"
)

type OIDCConfig struct {
	Issuer       string
	ClientID     string
	ClientSecret string
	RedirectURL  string
}

type OIDC struct {
	oauth    oauth2.Config
	verifier *oidc.IDTokenVerifier
	http     *http.Client
}

type Authorization struct {
	URL      string `json:"url"`
	State    string `json:"state"`
	Verifier string `json:"verifier"`
	Nonce    string `json:"nonce"`
}

func NewOIDC(ctx context.Context, config OIDCConfig) (*OIDC, error) {
	if config == (OIDCConfig{}) {
		return nil, nil
	}
	issuerURL, err := url.Parse(config.Issuer)
	if err != nil || issuerURL.Scheme != "https" || issuerURL.Hostname() == "" ||
		issuerURL.User != nil || issuerURL.RawQuery != "" || issuerURL.ForceQuery || issuerURL.Fragment != "" {
		return nil, errors.New("OIDC_ISSUER must be an HTTPS issuer URL")
	}
	redirect, err := url.Parse(config.RedirectURL)
	if err != nil || redirect.Scheme != "https" || redirect.Hostname() == "" || redirect.User != nil ||
		redirect.EscapedPath() != "/auth/callback" || redirect.RawQuery != "" || redirect.ForceQuery || redirect.Fragment != "" {
		return nil, errors.New("OIDC_REDIRECT_URL must be the HTTPS URL of /auth/callback")
	}
	if config.ClientID == "" || config.ClientSecret == "" {
		return nil, errors.New("OIDC_CLIENT_ID and OIDC_CLIENT_SECRET are required")
	}
	httpClient, _ := ctx.Value(oauth2.HTTPClient).(*http.Client)
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 10 * time.Second}
	}
	provider, err := oidc.NewProvider(oidc.ClientContext(ctx, httpClient), config.Issuer)
	if err != nil {
		return nil, fmt.Errorf("discover OIDC provider: %w", err)
	}
	endpoint := provider.Endpoint()
	var metadata struct {
		JWKSURL string `json:"jwks_uri"`
	}
	if err := provider.Claims(&metadata); err != nil {
		return nil, fmt.Errorf("read OIDC metadata: %w", err)
	}
	for _, address := range []string{endpoint.AuthURL, endpoint.TokenURL, metadata.JWKSURL} {
		location, err := url.Parse(address)
		if err != nil || location.Scheme != "https" || location.Hostname() == "" || location.User != nil {
			return nil, errors.New("OIDC authorization, token and JWKS endpoints must use HTTPS")
		}
	}
	return &OIDC{
		oauth: oauth2.Config{
			ClientID:     config.ClientID,
			ClientSecret: config.ClientSecret,
			Endpoint:     endpoint,
			RedirectURL:  config.RedirectURL,
			Scopes:       []string{oidc.ScopeOpenID},
		},
		verifier: provider.Verifier(&oidc.Config{ClientID: config.ClientID}),
		http:     httpClient,
	}, nil
}

func (client *OIDC) Start() Authorization {
	state, nonce, verifier := rand.Text(), rand.Text(), oauth2.GenerateVerifier()
	return Authorization{
		URL:      client.oauth.AuthCodeURL(state, oidc.Nonce(nonce), oauth2.S256ChallengeOption(verifier)),
		State:    state,
		Verifier: verifier,
		Nonce:    nonce,
	}
}

func (client *OIDC) Exchange(ctx context.Context, code, verifier, nonce string) (string, error) {
	token, err := client.oauth.Exchange(oidc.ClientContext(ctx, client.http), code, oauth2.VerifierOption(verifier))
	if err != nil {
		return "", err
	}
	raw, _ := token.Extra("id_token").(string)
	idToken, err := client.verifier.Verify(ctx, raw)
	if err != nil {
		return "", err
	}
	if idToken.Nonce != nonce || idToken.Subject == "" {
		return "", errors.New("invalid OIDC identity")
	}
	var claims struct {
		AuthorizedParty string `json:"azp"`
	}
	if err := idToken.Claims(&claims); err != nil {
		return "", err
	}
	if (claims.AuthorizedParty != "" || len(idToken.Audience) > 1) && claims.AuthorizedParty != client.oauth.ClientID {
		return "", errors.New("invalid OIDC authorized party")
	}
	return idToken.Subject, nil
}
