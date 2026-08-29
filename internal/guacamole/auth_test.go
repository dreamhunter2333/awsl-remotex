package guacamole

import (
	"testing"

	"github.com/dreamhunter2333/awsl-remotex/internal/assets"
	"github.com/dreamhunter2333/awsl-remotex/internal/credential"
)

func TestConnectionParametersVNCOverrides(t *testing.T) {
	asset := assets.Asset{
		Protocol: "vnc",
		Host:     "127.0.0.1",
		Port:     5900,
		Settings: assets.Settings{VNC: &assets.VNCSettings{Encodings: "tight", ColorDepth: 32}},
	}
	parameters := ConnectionParameters(asset, credential.Value{}, "dark")
	if parameters["encodings"] != "tight" || parameters["color-depth"] != "32" {
		t.Fatalf("unexpected VNC parameters: %#v", parameters)
	}
}

func TestConnectionParametersVNCDefaults(t *testing.T) {
	asset := assets.Asset{Protocol: "vnc", Host: "127.0.0.1", Port: 5900}
	parameters := ConnectionParameters(asset, credential.Value{}, "dark")
	if _, exists := parameters["encodings"]; exists {
		t.Fatalf("unexpected VNC encodings override: %#v", parameters)
	}
	if _, exists := parameters["color-depth"]; exists {
		t.Fatalf("unexpected VNC color depth override: %#v", parameters)
	}
}
