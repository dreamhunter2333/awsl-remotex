# HTTP API

All responses use JSON except successful `204 No Content` operations. Error responses have the shape `{"error":"message"}`. When login is enabled, asset and Guacamole HTTP requests require `Authorization: Bearer <JWT>`. The WebSocket handshake uses a one-time signed JWT in `remotex_ticket`, valid for up to 30 seconds.

除成功的 `204 No Content` 操作外，响应均为 JSON。错误格式为 `{"error":"message"}`。启用登录后，资产 API 和 Guacamole HTTP 请求需要 `Authorization: Bearer <JWT>`。WebSocket 握手通过 `remotex_ticket` 传递一次性签名 JWT，最长有效 30 秒。

## Health and authentication / 健康检查与认证

| Method | Path | Description / 说明 |
| --- | --- | --- |
| `GET` | `/api/health` | Process liveness / 进程存活检查 |
| `GET` | `/api/ready` | SQLite, `guacd`, and Guacamole readiness / SQLite、`guacd` 与 Guacamole 就绪检查 |
| `GET` | `/api/auth/status` | Authentication state, `oidc`, `sessionIdleSeconds`, and `sessionExpiresInMs` for active JWTs / 认证状态、OIDC 模式、空闲超时秒数与有效 JWT 剩余毫秒数 |
| `POST` | `/api/auth/login` | Accepts `{"username":"...","password":"..."}` and returns `{"token":"<JWT>"}` / 密码登录并返回 JWT |
| `POST` | `/api/auth/oidc/start` | Returns the authorization URL, state, nonce, and PKCE verifier / 获取授权地址和回调校验参数 |
| `POST` | `/api/auth/oidc/exchange` | Accepts `code`, `verifier` and `nonce`, then returns `{"token":"<JWT>"}` / 验证 OIDC 登录并返回 JWT |
| `POST` | `/api/auth/tunnel` | Exchanges the current Bearer JWT for `{"token":"<tunnel JWT>"}` / 用会话 JWT 换取一次性隧道 JWT |
| `DELETE` | `/api/auth/session` | Revokes the current Bearer JWT session / 撤销当前 JWT 会话 |

## Asset shape / 资产结构

Writable requests use:

```json
{
  "name": "prod-web-01",
  "group": "Production",
  "protocol": "ssh",
  "host": "10.10.2.18",
  "port": 22,
  "username": "operator",
  "settings": {},
  "credentialType": "password",
  "password": "secret"
}
```

- `protocol`: `ssh`, `rdp`, or `vnc`; a zero port defaults to 22, 3389, or 5900.
- An empty `group` is stored as the default group.
- `credentialType`: `prompt`, `password`, or `private-key`; private keys are SSH-only.
- `private-key` requests use `privateKey` and optional `passphrase`.
- On update, blank secret fields preserve an existing credential when its type is unchanged. Switching to `prompt` removes it.
- Responses never include credential plaintext; they expose `credentialType` and `credentialConfigured`.
- VNC assets may opt into `settings.vnc.encodings` (`tight`), `settings.vnc.colorDepth` (`8`, `16`, `24`, or `32`), `settings.vnc.cursor` (`remote`), and `settings.vnc.wheelDirection` (`reverse`). Wheel direction is applied in the browser. Omit `settings.vnc` to keep all defaults. / VNC 资产可按需设置 `settings.vnc.encodings`（`tight`）、`settings.vnc.colorDepth`（`8`、`16`、`24` 或 `32`）、`settings.vnc.cursor`（`remote`）和 `settings.vnc.wheelDirection`（`reverse`）。滚轮方向由浏览器处理；省略 `settings.vnc` 时保留全部默认行为。
- Because updates replace the full asset, preserve the returned `settings` value unless the override should be removed. / 更新会完整替换资产；除非需要删除覆盖参数，否则应保留响应中的 `settings`。

## Asset endpoints / 资产接口

| Method | Path | Description / 说明 |
| --- | --- | --- |
| `GET` | `/api/assets` | List assets / 资产列表 |
| `POST` | `/api/assets` | Create an asset / 创建资产 |
| `PUT` | `/api/assets/{id}` | Full asset update, not a partial patch / 完整更新，不是局部 Patch |
| `DELETE` | `/api/assets/{id}` | Delete an asset / 删除资产 |
| `POST` | `/api/assets/{id}/connect?theme=dark` | Issue a short-lived connection ticket / 生成短期连接票据 |
| `POST` | `/api/assets/{id}/test` | Test a saved asset / 测试已保存资产 |
| `POST` | `/api/assets/test` | Test form values with `{"assetId":"optional","asset":{...}}` / 测试表单内容 |

Test responses contain `reachable`, `latencyMs`, and `message`. An RDP probe that reaches the server also returns `loginUnverified: true`. Open an RDP session to verify sign-in. List assets and select the exact ID to look up a single asset.

Guacamole itself is exposed through the authenticated `/guacamole/*` reverse proxy for the official browser SDK. That proxy is an implementation detail rather than a stable Awsl RemoteX API.
