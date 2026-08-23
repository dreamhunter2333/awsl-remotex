# Awsl RemoteX

**English** | [简体中文](README.zh-CN.md)

Awsl RemoteX is a lightweight, modern browser-based remote workspace for managing SSH, RDP, and VNC connections in one place.

## Features

- SSH, RDP, and VNC remote connections
- Multiple connection tabs with fast session switching
- Single-click selection and double-click connection
- Create, edit, delete, and test remote connections
- Encrypted passwords and SSH private keys with automatic login
- Fully hideable asset sidebar
- Reconnect, disconnect, and fullscreen controls
- Mobile and tablet soft-keyboard control
- Preset and user-defined key combinations on all devices
- One Half Dark, One Half Light, and system themes
- Chinese and English interfaces
- Installable PWA for desktop and mobile devices
- Optional global access password
- Local SQLite storage

## Usage

1. Add an SSH, RDP, or VNC asset from the bottom of the sidebar.
2. Single-click an asset to select it, or double-click it to connect immediately.
3. Use the edit button on an asset to update, test, or delete it.
4. Each connection opens in its own tab. Reconnect, fullscreen, and disconnect controls are available on the right side of the tab bar.
5. Remote displays automatically resize when the sidebar or browser window changes.

Detailed references: [architecture](docs/architecture.md) and [configuration](docs/configuration.md).

## Docker Compose

Clone the repository, then create `.env`:

```dotenv
GUACAMOLE_JSON_SECRET=<output of openssl rand -hex 16>
CREDENTIAL_KEY=<output of openssl rand -hex 32>
AUTH_PASSWORD=
GUACAMOLE_SESSION_TIMEOUT_MINUTES=1440
SESSION_IDLE_TIMEOUT=24h
```

`AUTH_PASSWORD` is optional. Set it and use HTTPS when exposing the service publicly.

```yaml
services:
  awsl-remotex:
    build:
      context: .
      dockerfile: Dockerfile.dev
    ports:
      - "8080:8080"
    volumes:
      - ./data:/app/data
    environment:
      AUTH_PASSWORD: ${AUTH_PASSWORD:-}
      CREDENTIAL_KEY: ${CREDENTIAL_KEY:?set CREDENTIAL_KEY}
      GUACAMOLE_JSON_SECRET: ${GUACAMOLE_JSON_SECRET:?set GUACAMOLE_JSON_SECRET}
      GUACAMOLE_UPSTREAM: http://guacamole:8080
      GUACD_ADDRESS: guacd:4822
      SESSION_IDLE_TIMEOUT: ${SESSION_IDLE_TIMEOUT:-24h}
    depends_on:
      - guacamole
    restart: unless-stopped

  guacd:
    image: guacamole/guacd:1.6.0
    restart: unless-stopped

  guacamole:
    image: guacamole/guacamole:1.6.0
    environment:
      GUACD_HOSTNAME: guacd
      JSON_ENABLED: "true"
      JSON_SECRET_KEY: ${GUACAMOLE_JSON_SECRET:?set GUACAMOLE_JSON_SECRET}
      API_SESSION_TIMEOUT: ${GUACAMOLE_SESSION_TIMEOUT_MINUTES:-1440}
    depends_on:
      - guacd
    restart: unless-stopped
```

Start the service and open `http://localhost:8080`:

```bash
docker compose up -d --build
```

## Credentials and security

- Assets can store a password or SSH private key, or keep no saved credential.
- Saved credentials are encrypted with AES-256-GCM before being written to SQLite.
- Asset lists and API responses never return saved passwords or private keys.
- Connection tests ask `guacd` to establish a real SSH, RDP, or VNC connection with the current form values.
- `.env`, SQLite databases, and runtime data are excluded from Git by default.

## Scope

Awsl RemoteX focuses on remote control. It does not provide session recording, playback, command auditing, approval workflows, or internal web proxying.
