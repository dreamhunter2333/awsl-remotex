---
name: asset-management
description: Manage Awsl-RemoteX assets through its HTTP API, including listing, creating, updating, deleting, and testing SSH, RDP, or VNC endpoint reachability. Use when operating assets in a running Awsl-RemoteX instance; do not use for direct SQLite edits.
---

# Awsl-RemoteX Asset Management

Use the running service API instead of editing SQLite. Resolve the base URL from `AWSL_REMOTEX_URL`, defaulting to `http://127.0.0.1:8080`.

## Authentication

Call `GET /api/auth/status` first. If `required` is true, authenticate through `POST /api/auth/login` with `{"password":"..."}` and retain the returned cookie for all later requests. Read the password from `AWSL_REMOTEX_PASSWORD`, falling back to `AUTH_PASSWORD`; never print it or place it directly in a visible command line. Stop and report the requirement if neither variable is set.

## Asset operations

Assets use this complete writable shape:

```json
{
  "name": "prod-web-01",
  "group": "Production",
  "protocol": "ssh",
  "host": "10.10.2.18",
  "port": 22,
  "username": "operator",
  "credentialType": "password",
  "password": "secret"
}
```

`protocol` must be `ssh`, `rdp`, or `vnc`. An empty group becomes the localized default group. Ports default to 22, 3389, and 5900 respectively when omitted or zero.

`credentialType` must be `prompt`, `password`, or `private-key`; `private-key` is only valid for SSH. Password credentials use `password`. Private-key credentials use `privateKey` and optional `passphrase`. Never print credentials. List responses expose only `credentialType` and `credentialConfigured`, not the stored secret. On update, blank secret fields preserve the existing credential when its type is unchanged; changing to `prompt` removes it.

- List: `GET /api/assets`
- Create: `POST /api/assets` with the complete writable shape
- Read one: list assets and select the exact `id`; there is no separate public single-asset endpoint
- Update: `PUT /api/assets/{id}` with the complete writable shape; this is full replacement, not a partial patch
- Delete: `DELETE /api/assets/{id}` only after resolving and reporting the exact asset target
- Test reachability: `POST /api/assets/{id}/test`

The test response contains `reachable`, `latencyMs`, and `message`. It tests TCP reachability of the configured host and port with a five-second timeout. It does not validate a remote username, password, private key, desktop login, or Guacamole rendering. State that distinction when reporting results.

Treat 401 as missing or expired Awsl-RemoteX authentication, 404 as a stale asset ID, and other non-success responses as operation failures. Do not retry mutations automatically after an ambiguous network failure; list assets first to determine whether the change was applied.
