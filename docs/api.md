# HTTP API

All responses use JSON except successful `204 No Content` operations. Error responses have the shape `{"error":"message"}`. Asset and Guacamole proxy routes require the application session cookie when `AUTH_PASSWORD` is configured.

除成功的 `204 No Content` 操作外，响应均为 JSON。错误格式为 `{"error":"message"}`。配置 `AUTH_PASSWORD` 后，资产 API 与 Guacamole 代理需要应用会话 Cookie。

## Health and authentication / 健康检查与认证

| Method | Path | Description / 说明 |
| --- | --- | --- |
| `GET` | `/api/health` | Process liveness / 进程存活检查 |
| `GET` | `/api/ready` | SQLite, `guacd`, and Guacamole readiness / SQLite、`guacd` 与 Guacamole 就绪检查 |
| `GET` | `/api/auth/status` | Authentication state and `sessionIdleSeconds` / 认证状态与空闲超时秒数 |
| `POST` | `/api/auth/login` | Body: `{"username":"...","password":"..."}` / 登录 |
| `DELETE` | `/api/auth/session` | Clear the login cookie / 退出登录 |

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

Test responses contain `reachable`, `latencyMs`, and `message`. There is no public single-asset `GET` endpoint; list assets and select the exact ID.

Guacamole itself is exposed through the authenticated `/guacamole/*` reverse proxy for the official browser SDK. That proxy is an implementation detail rather than a stable Awsl RemoteX API.
