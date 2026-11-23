#!/bin/sh
set -eu

printf '%s\n' "$DISPLAY" > "$HOME/.e2e-rdp-display"
XDG_RUNTIME_DIR="$(mktemp -d)"
export XDG_RUNTIME_DIR
printf '%s\n' "$XDG_RUNTIME_DIR" > "$HOME/.e2e-rdp-audio"

exec dbus-run-session -- sh -c '
    pipewire &
    wireplumber &
    (
        until pw-cli info 0 >/dev/null 2>&1; do sleep 0.1; done
        exec pw-cli -m load-module libpipewire-module-xrdp "sink.stream.props={ node.name=xrdp-sink }"
    ) &
    exec xterm -title "RemoteX RDP fixture"
'
