package assets

import "testing"

func TestNormalizeVNCSettings(t *testing.T) {
	input := Input{
		Name:     "console",
		Protocol: "vnc",
		Host:     "127.0.0.1",
		Settings: Settings{VNC: &VNCSettings{Encodings: " TIGHT ", ColorDepth: 32}},
	}
	if err := input.Normalize(); err != nil {
		t.Fatal(err)
	}
	if input.Settings.VNC == nil || input.Settings.VNC.Encodings != "tight" {
		t.Fatalf("unexpected VNC settings: %#v", input.Settings.VNC)
	}
}

func TestNormalizeOmitsUnusedVNCSettings(t *testing.T) {
	input := Input{
		Name:     "console",
		Protocol: "vnc",
		Host:     "127.0.0.1",
		Settings: Settings{VNC: &VNCSettings{}},
	}
	if err := input.Normalize(); err != nil {
		t.Fatal(err)
	}
	if input.Settings.VNC != nil {
		t.Fatalf("expected empty VNC settings to be omitted: %#v", input.Settings.VNC)
	}
}
