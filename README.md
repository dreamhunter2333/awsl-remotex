# Awsl RemoteX

**English** | [简体中文](README.zh-CN.md)

A focused browser workspace for SSH, RDP, and VNC. Assets live in one sidebar while multiple remote sessions remain open in tabs.

![Awsl RemoteX workspace](docs/images/workspace.webp)

## Highlights

- SSH, RDP, and VNC through Apache Guacamole
- Multiple live sessions rendered directly through the official Guacamole SDK and Canvas
- Asset creation, editing, deletion, connection testing, and encrypted saved credentials
- Reconnect, disconnect, fullscreen, soft keyboard, and custom key combinations
- Responsive layout, installable PWA, automatic updates, English and Chinese UI
- Optional application authentication and local SQLite storage

Awsl RemoteX intentionally does not include recording, playback, approval workflows, command auditing, or an internal web proxy.

## Docker Compose

Docker with Compose v2 or later is required. A normal deployment does not require the source repository. Create a directory and save this as `compose.yaml`:

```yaml
services:
  awsl-remotex:
    image: ghcr.io/dreamhunter2333/awsl-remotex:latest
    ports:
      - "8080:8080"
    volumes:
      - ./data:/app/data
    environment:
      AUTH_USERNAME: ${AUTH_USERNAME:-admin}
      AUTH_PASSWORD: ${AUTH_PASSWORD:-}
      CREDENTIAL_KEY: ${CREDENTIAL_KEY:?set CREDENTIAL_KEY}
      GUACAMOLE_JSON_SECRET: ${GUACAMOLE_JSON_SECRET:?set GUACAMOLE_JSON_SECRET}
      GUACAMOLE_UPSTREAM: http://guacamole:8080
      GUACD_ADDRESS: guacd:4822
      SESSION_IDLE_TIMEOUT: ${SESSION_IDLE_TIMEOUT:-24h}
    depends_on: [guacamole]
    restart: unless-stopped

  guacamole:
    image: guacamole/guacamole:1.6.0
    environment:
      GUACD_HOSTNAME: guacd
      JSON_ENABLED: "true"
      JSON_SECRET_KEY: ${GUACAMOLE_JSON_SECRET:?set GUACAMOLE_JSON_SECRET}
      API_SESSION_TIMEOUT: ${GUACAMOLE_SESSION_TIMEOUT_MINUTES:-1440}
    depends_on: [guacd]
    restart: unless-stopped

  guacd:
    image: ghcr.io/dreamhunter2333/awsl-remotex-guacd:1.6.1
    restart: unless-stopped

  pve-vnc-proxy:
    profiles: [pve]
    image: ghcr.io/dreamhunter2333/pve-vnc-proxy:v0.1.0
    environment:
      PVE_HOST: ${PVE_HOST:-}
      PVE_LISTEN: 0.0.0.0:5900
      PVE_INSECURE: ${PVE_INSECURE:-false}
      PVE_MAX_CONNS: ${PVE_MAX_CONNS:-256}
    restart: unless-stopped
```

Create `.env` in the same directory:

```dotenv
AUTH_USERNAME=admin
AUTH_PASSWORD=replace-with-a-strong-password
GUACAMOLE_JSON_SECRET=replace-with-32-random-hex-characters
CREDENTIAL_KEY=replace-with-64-random-hex-characters
```

Generate the two random values with `openssl rand -hex 16` and `openssl rand -hex 32`, respectively, and replace the example login password. An empty `AUTH_PASSWORD` disables application authentication and is suitable only for an intentionally trusted network.

For a new installation, initialize the empty data directory before starting. The application runs as the non-root `awsl` user; the one-off command below grants it access to the mounted directory using the image's own user and group:

```bash
docker compose pull
mkdir -p ./data
docker compose run --rm --no-deps --user root --entrypoint sh awsl-remotex \
  -c 'chown awsl:awsl /app/data && chmod 750 /app/data'
docker compose up -d
curl --fail --silent --show-error --retry 30 --retry-all-errors --retry-delay 2 \
  http://127.0.0.1:8080/api/ready
```

Open `http://localhost:8080`. Use HTTPS whenever the service is reachable beyond a trusted network. See [Deployment](docs/deployment.md) for version pinning, reverse proxies, upgrades, and health checks.

## Kubernetes with Helm

These optional examples require an existing local Awsl RemoteX Helm chart compatible with the values described in [Deployment](docs/deployment.md). A chart is not bundled with this project; use Docker Compose above if you do not have one. Run the commands from the parent of the `awsl-remotex/` chart directory, which must contain `Chart.yaml`, `values.yaml`, and `templates/`. The expected layout is one `StatefulSet` replica with Awsl RemoteX, Guacamole, and `guacd` in the same Pod, with SQLite on a PVC:

```bash
helm upgrade --install awsl-remotex ./awsl-remotex \
  --namespace default \
  --set-string auth.username=admin \
  --set-string auth.password='replace-with-a-strong-password' \
  --wait --timeout 10m
kubectl -n default rollout status statefulset/awsl-remotex
kubectl -n default port-forward service/awsl-remotex 8080:80
```

Open `http://localhost:8080`. Ingress, existing Secrets, resource settings, and upgrades are documented in [Deployment](docs/deployment.md).

## Proxmox VE VNC consoles

The optional `pve-vnc-proxy` converts a normal VNC connection into a short-lived Proxmox VE QEMU console session. The proxy itself is stateless and does not persist PVE tokens. If the asset uses a saved password, RemoteX encrypts and stores its Token Secret in SQLite. With Compose, enable the `pve` profile and use `pve-vnc-proxy:5900` as the asset address. With Helm, enable `pveVncProxy` and use `127.0.0.1:5900` because all containers share the Pod network.

For Docker Compose, append these values to `.env`:

```dotenv
PVE_HOST=https://pve.example.com:8006
PVE_INSECURE=false
PVE_MAX_CONNS=256
```

```bash
docker compose --profile pve up -d
```

Helm values:

```yaml
pveVncProxy:
  enabled: true
  env:
    PVE_HOST: "https://pve.example.com:8006"
    PVE_LISTEN: "127.0.0.1:5900"
    PVE_INSECURE: "false"
    PVE_MAX_CONNS: "256"
```

Save this as `remotex-values.yaml`, then install or upgrade:

```bash
helm upgrade --install awsl-remotex ./awsl-remotex \
  --namespace default \
  --set-string auth.username=admin \
  --set-string auth.password='replace-with-a-strong-password' \
  -f remotex-values.yaml \
  --wait --timeout 10m
```

Create a VNC asset with Host `pve-vnc-proxy` for Compose or `127.0.0.1` for Helm, Port `5900`, Username `<node>@<vmid>@<token-id>`, and the PVE Token Secret as a saved password. The token needs `PVEVMUser` on the target `/vms/<vmid>`. For PVE Windows clipboard, enable VNC clipboard and install SPICE Guest Tools in the guest; then enable custom VNC parameters in the asset and set Clipboard encoding to `UTF-8`.

The included `guacd` image is built from pinned Apache Guacamole source with one narrow LibVNCClient patch. QEMU announces extended clipboard changes and waits for the client to request their contents; the LibVNCClient version used by the official Guacamole 1.6.0 `guacd` image ignores that notification. The patch sends the missing request so clipboard data can travel from a PVE guest back to the browser. It does not change SSH, RDP, authentication, or normal VNC routing.

The full configuration, official `guacd` fallback, reverse-proxy requirements, and troubleshooting are in [Deployment](docs/deployment.md).

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
