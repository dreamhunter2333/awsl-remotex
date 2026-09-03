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
		Settings: assets.Settings{VNC: &assets.VNCSettings{Encodings: "tight", ColorDepth: 32, Cursor: "remote", WheelDirection: "reverse", ClipboardEncoding: "UTF-8"}},
	}
	parameters := ConnectionParameters(asset, credential.Value{}, "dark")
	if parameters["encodings"] != "tight" || parameters["color-depth"] != "32" {
		t.Fatalf("unexpected VNC parameters: %#v", parameters)
	}
	if parameters["cursor"] != "remote" {
		t.Fatalf("unexpected VNC cursor parameter: %#v", parameters)
	}
	if parameters["clipboard-encoding"] != "UTF-8" {
		t.Fatalf("unexpected VNC clipboard encoding: %#v", parameters)
	}
	if _, exists := parameters["wheel-direction"]; exists {
		t.Fatalf("wheel direction must remain a browser-only setting: %#v", parameters)
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
	if _, exists := parameters["cursor"]; exists {
		t.Fatalf("unexpected VNC cursor override: %#v", parameters)
	}
	if _, exists := parameters["clipboard-encoding"]; exists {
		t.Fatalf("unexpected VNC clipboard encoding override: %#v", parameters)
	}
}
