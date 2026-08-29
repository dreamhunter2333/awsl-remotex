# Awsl RemoteX

**English** | [简体中文](README.zh-CN.md)

A focused browser workspace for SSH, RDP, and VNC. Assets live in one sidebar while multiple remote sessions remain open in tabs.

![Awsl RemoteX workspace](docs/images/workspace.webp)

## Highlights

- SSH, RDP, and VNC through Apache Guacamole 1.6.0
- Multiple live sessions rendered directly through the official Guacamole SDK and Canvas
- Asset creation, editing, deletion, connection testing, and encrypted saved credentials
- Reconnect, disconnect, fullscreen, soft keyboard, and custom key combinations
- Responsive layout, installable PWA, automatic updates, English and Chinese UI
- Optional application authentication and local SQLite storage

Awsl RemoteX intentionally does not include recording, playback, approval workflows, command auditing, or an internal web proxy.

## Quick start

Docker with Compose v2 is required. Create the environment file and replace all example secrets before starting:

```bash
cp .env.example .env
openssl rand -hex 16
openssl rand -hex 32
```

Use the 32-character output as `GUACAMOLE_JSON_SECRET`, the 64-character output as `CREDENTIAL_KEY`, and set a strong `AUTH_PASSWORD`. Leaving `AUTH_PASSWORD` empty disables application authentication and should only be done on an intentionally trusted network.

Start the source-build stack defined in [compose.yaml](compose.yaml):

```bash
docker compose up -d --build
```

Open `http://localhost:8080`. Use HTTPS whenever the service is reachable beyond a trusted network.

Published multi-architecture images are available from `ghcr.io/dreamhunter2333/awsl-remotex`. See [Deployment](docs/deployment.md) for image-based installation, reverse-proxy requirements, upgrades, and health checks.

## Using the workspace

1. Add an SSH, RDP, or VNC asset from the bottom of the sidebar.
2. Single-click to select an asset or double-click to connect.
3. Open the editor to update, test, or delete a connection.
4. Switch live sessions through the tab bar; session controls remain on its right.

When an active remote session is connected, page-level keyboard input is routed to that session. Mouse interaction with the surrounding UI remains available. Browser- or operating-system-reserved shortcuts may not be capturable by a web application.

## Documentation

- [Documentation index](docs/README.md)
- [Architecture](docs/architecture.md)
- [Configuration](docs/configuration.md)
- [Deployment](docs/deployment.md)
- [Operations and troubleshooting](docs/operations.md)
- [HTTP API](docs/api.md)
- [Development and releases](docs/development.md)
- [Changelog](CHANGELOG.md)
- [Security policy](SECURITY.md)

Saved passwords and private keys are encrypted with AES-256-GCM before being written to SQLite. Asset APIs never return stored credential values. Preserve `CREDENTIAL_KEY`: encrypted credentials cannot be recovered without it.
