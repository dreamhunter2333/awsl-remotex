# Configuration / 配置

## Application environment / 应用环境变量

“Needed for” describes the feature that requires a value. The process can start without optional integrations, but readiness or remote-control features may then be unavailable.

“用途”说明缺少该值时受影响的功能。程序可以在部分集成未配置时启动，但就绪检查或远程控制功能可能不可用。

| Variable | Default | Needed for / 用途 |
| --- | --- | --- |
| `ADDR` | `:8080` | HTTP listen address / HTTP 监听地址 |
| `DATABASE_PATH` | `data/awsl-remotex.db` | SQLite file path / SQLite 文件路径 |
| `WEB_DIR` | `web/dist` | Built frontend directory / 前端构建目录 |
| `AUTH_USERNAME` | `admin` | Login username when authentication is enabled / 启用认证后的登录用户名 |
| `AUTH_PASSWORD` | empty | Empty disables application authentication / 留空会禁用应用认证 |
| `CREDENTIAL_KEY` | empty | Required to save or decrypt credentials; exactly 64 hexadecimal characters / 保存或解密凭据必需，必须是 64 个十六进制字符 |
| `GUACAMOLE_JSON_SECRET` | empty | Required for remote sessions; exactly 32 hexadecimal characters and must equal Guacamole `JSON_SECRET_KEY` / 远程会话必需，必须是 32 个十六进制字符并与 Guacamole 一致 |
| `GUACAMOLE_UPSTREAM` | empty | Required for the Guacamole proxy, readiness, and remote sessions; Compose uses `http://guacamole:8080` / Guacamole 代理、就绪检查和远程会话必需；Compose 使用 `http://guacamole:8080` |
| `GUACD_ADDRESS` | `guacd:4822` | `guacd` readiness and connection testing / `guacd` 就绪检查与连接测试 |
| `SESSION_IDLE_TIMEOUT` | `24h` | Positive Go duration after which inactive remote tabs are disconnected / 无活动远程 Tab 自动断开的正数 Go 时长 |
| `GUACAMOLE_PUBLIC_PATH` | `/guacamole` | Compatibility setting used when issuing ticket URLs; the direct client and proxy currently require `/guacamole` / 票据 URL 兼容项；当前直连客户端与代理固定要求 `/guacamole` |

Generate independent secrets locally:

```bash
openssl rand -hex 16
openssl rand -hex 32
```

Use the 32-character output for `GUACAMOLE_JSON_SECRET` and the 64-character output for `CREDENTIAL_KEY`. Do not reuse either as `AUTH_PASSWORD`.

分别将 32 字符输出用于 `GUACAMOLE_JSON_SECRET`，64 字符输出用于 `CREDENTIAL_KEY`，不要复用为 `AUTH_PASSWORD`。

## Compose-only values / Compose 专用变量

| Variable | Default | Purpose / 用途 |
| --- | --- | --- |
| `GUACAMOLE_SESSION_TIMEOUT_MINUTES` | `1440` | Passed to Guacamole as `API_SESSION_TIMEOUT`; it is not read by the Go application / 作为 `API_SESSION_TIMEOUT` 传给 Guacamole，Go 应用不会读取 |

The checked-in [compose.yaml](../compose.yaml) supplies the internal upstream addresses. `.env` is used only for Compose interpolation and is excluded from Git and Docker build contexts.

仓库中的 [compose.yaml](../compose.yaml) 已提供内部服务地址。`.env` 只用于 Compose 变量替换，且不会进入 Git 或 Docker 构建上下文。

## Persistent data / 持久数据

The container stores SQLite data under `/app/data`. Keep `CREDENTIAL_KEY` unchanged after credentials have been saved. A missing or different key does not reveal plaintext; it makes existing encrypted credentials unusable.

容器将 SQLite 数据保存在 `/app/data`。保存凭据后必须保持 `CREDENTIAL_KEY` 不变；密钥缺失或变化不会泄露明文，但会使已有加密凭据不可用。

See [Operations](operations.md) for safe backup and restore procedures.

## Browser behavior / 浏览器行为

- Language, theme, sidebar state, open tabs, activity timestamps, and custom key combinations are stored in browser local storage.
- The soft-keyboard button is visible on detected touch devices. The send-keys menu is available on desktop and touch devices.
- While an active session is connected, the Guacamole keyboard listens at document level and routes capturable page keyboard input to that session. Opening a modal dialog suspends remote keyboard capture so its form controls receive input locally. Mouse clicks on surrounding controls keep their normal behavior.
- Browser- and operating-system-reserved shortcuts may never reach JavaScript and therefore cannot be forwarded.
- The PWA checks for updates on registration, foreground return, and every 15 minutes; a new worker activates automatically.
- On iOS/iPadOS, reinstall an existing PWA if manifest or status-bar metadata changes.

- 语言、主题、侧边栏、已打开 Tab、活动时间和自定义快捷键保存在浏览器本地存储中。
- 软键盘按钮在检测到触屏设备时显示；发送按键菜单在桌面端和触屏端均可用。
- 活动会话连接后，Guacamole 在文档级监听键盘，并将网页能捕获的输入路由到该会话；打开模态弹窗会暂停远程键盘捕获，使表单控件在本地接收输入。其他控件的鼠标点击行为不变。
- 浏览器或操作系统保留的快捷键可能不会到达 JavaScript，因此无法转发。
- PWA 会在注册、回到前台以及每 15 分钟检查更新，并自动激活新版本。
- iOS/iPadOS 的清单或状态栏元数据变化后，应重新安装已有 PWA。
