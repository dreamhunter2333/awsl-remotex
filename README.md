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

Docker with Compose v2 is required. Clone the repository, create the environment file, and replace the example password and secrets:

```bash
git clone https://github.com/dreamhunter2333/awsl-remotex.git
cd awsl-remotex
cp .env.example .env
openssl rand -hex 16
openssl rand -hex 32
```

Use the 32-character output as `GUACAMOLE_JSON_SECRET`, the 64-character output as `CREDENTIAL_KEY`, and set a strong `AUTH_PASSWORD`. Leaving `AUTH_PASSWORD` empty disables application authentication and should only be done on an intentionally trusted network.

Start the stack from source:

```bash
docker compose up -d --build
docker compose ps
curl --fail --silent --show-error --retry 30 --retry-all-errors --retry-delay 2 \
  http://127.0.0.1:8080/api/ready
```

To use a published image instead of building locally:

```bash
AWSL_REMOTEX_IMAGE=ghcr.io/dreamhunter2333/awsl-remotex:latest \
  docker compose pull
AWSL_REMOTEX_IMAGE=ghcr.io/dreamhunter2333/awsl-remotex:latest \
  docker compose up -d --no-build
```

Open `http://localhost:8080`. Use HTTPS whenever the service is reachable beyond a trusted network. See [Deployment](docs/deployment.md) for version pinning, reverse proxies, upgrades, and health checks.

## Kubernetes with Helm

The Helm chart runs one `StatefulSet` replica with Awsl RemoteX, Guacamole, and `guacd` in the same Pod and persists SQLite on a PVC:

```bash
git clone https://github.com/dreamhunter2333/helm-charts.git
cd helm-charts
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

Docker `.env`:

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
