# Architecture / 架构

## 中文

Awsl RemoteX 由一个 Go HTTP 服务、Apache Guacamole 和 `guacd` 组成。Go 服务提供认证、资产 API、SQLite 持久化、静态前端以及到 Guacamole 的同源反向代理。构建后的 React 文件位于 `WEB_DIR`，不会嵌入 Go 二进制。

### 模块边界

- `cmd/server`：进程入口、配置加载和依赖装配。
- `internal/httpapi`：HTTP 路由、认证中间件、资产 API、健康检查、静态文件与 Guacamole 反向代理。
- `internal/assets`：资产业务规则与连接流程。
- `internal/database`：SQLite 模式、轻量迁移与持久化。
- `internal/credential`：密码和 SSH 私钥的 AES-256-GCM 加密与解密。
- `internal/guacamole`：短期 JSON 认证票据和基于 `guacd` 的连接测试。
- `web/src/components`：界面组件和 Canvas 远程画面。
- `web/src/hooks/use-sessions.ts`：多 Tab 会话、恢复、排队连接和空闲清理。
- `web/src/lib/guacamole-sdk.ts`：加载随应用发布的 Guacamole 1.6.0 SDK。
- `web/src/lib/guacamole-session.ts`：认证、WebSocket 隧道、Canvas、键鼠和剪贴板生命周期。

### 连接流程

1. 浏览器向 `POST /api/assets/{id}/connect` 请求指定资产的短期连接票据。
2. Go 服务读取资产和加密凭据，生成有效期 30 秒的 Guacamole JSON 票据。
3. 前端加载随应用发布的官方 SDK，并将票据提交到 `/guacamole/api/tokens`。
4. SDK 创建 `Guacamole.Client`，通过 `/guacamole/websocket-tunnel` 建立同源 WebSocket 隧道。
5. Guacamole 将连接交给 `guacd`，由其建立 SSH、RDP 或 VNC 会话；画面直接渲染到页面 Canvas。
6. 关闭 Tab、主动断开或空闲超时时，前端断开客户端、注销 Guacamole token 并清理本地会话状态。

同一时刻只向活动且已连接的会话发送页面级键盘事件。模态弹窗打开时会暂停远程键盘捕获并释放已按下的远程按键，使表单输入只留在本地。按键按下后即使切换 Tab，释放事件仍返回原会话，避免 Ctrl、Alt 等修饰键卡住。真实鼠标优先使用远程硬件光标；浏览器不支持自定义光标时回退到软件光标。

会话不会自动重连。意外断开后，Tab 保留并显示明确的重连提示。

### 部署模型

应用按单副本设计，SQLite 每个进程仅使用一个连接。应用数据目录需要持久化；Guacamole 与 `guacd` 不保存 Awsl RemoteX 的业务数据。所有 `/guacamole/*` HTTP 和 WebSocket 流量都通过 Go 服务代理，当前公开路径固定为 `/guacamole`。

Helm 将 Awsl RemoteX、Guacamole 与 `guacd` 放进同一个 StatefulSet Pod；启用 PVE VNC Proxy 后增加第四个 Sidecar。容器共享 Pod 网络，因此内部地址均使用 `127.0.0.1`。Docker Compose 中各进程位于独立容器，通过服务名互访。

### 定制 guacd 的边界

PVE/QEMU 的 RFB Extended Clipboard 会先发送 `Notify`，等待客户端发送 `Request` 后才提供剪贴板文本。Guacamole 1.6.0 官方 `guacd` 镜像所用的 LibVNCClient 会忽略这类非 `Provide` 消息，使 Guest 到浏览器方向无法同步。项目的 `guacd` 镜像从固定版本的 Apache Guacamole 与 LibVNCServer 源码构建，只补充收到文本 `Notify` 后发送 `Request` 的行为。

该补丁位于 `build/guacd/patches`，不会改变 SSH、RDP、JSON 认证、PVE Token 或普通 VNC 数据通道。镜像构建工作流固定上游提交，并发布多架构镜像、SBOM 与来源证明。无需 PVE Extended Clipboard 时可改回官方 `guacamole/guacd`。

## English

Awsl RemoteX consists of one Go HTTP service, Apache Guacamole, and `guacd`. The Go service provides authentication, asset APIs, SQLite persistence, static frontend files, and a same-origin reverse proxy to Guacamole. Built React files are served from `WEB_DIR`; they are not embedded in the Go binary.

### Boundaries

- `cmd/server`: process entry point, configuration loading, and dependency wiring.
- `internal/httpapi`: routing, authentication, asset APIs, health checks, static files, and the Guacamole proxy.
- `internal/assets`: asset rules and connection orchestration.
- `internal/database`: SQLite schema, lightweight migrations, and persistence.
- `internal/credential`: AES-256-GCM encryption for passwords and SSH keys.
- `internal/guacamole`: short-lived JSON authentication tickets and `guacd`-based connection tests.
- `web/src/components`: UI components and the Canvas remote viewport.
- `web/src/hooks/use-sessions.ts`: tab lifecycle, restoration, connection queueing, and idle cleanup.
- `web/src/lib/guacamole-sdk.ts`: loading the bundled Guacamole 1.6.0 SDK.
- `web/src/lib/guacamole-session.ts`: authentication, WebSocket tunnel, Canvas, input, and clipboard lifecycle.

### Connection lifecycle

1. The browser requests a short-lived ticket from `POST /api/assets/{id}/connect`.
2. The Go service loads the asset and encrypted credential and creates a Guacamole JSON ticket valid for 30 seconds.
3. The frontend loads the bundled official SDK and exchanges the ticket through `/guacamole/api/tokens`.
4. The SDK creates a `Guacamole.Client` and opens the same-origin `/guacamole/websocket-tunnel`.
5. Guacamole delegates SSH, RDP, or VNC to `guacd`, while the SDK renders directly into the page Canvas.
6. Closing a tab, disconnecting, or reaching the idle timeout disconnects the client, revokes the token, and clears local session state.

Page-level keyboard events are sent only to the active connected session. Remote keyboard capture is suspended and pressed remote keys are released while a modal dialog is open, keeping form input local. A key release is returned to the session that owned its key press even if the active tab changes, preventing stuck modifiers. The real mouse uses the remote hardware cursor when supported and falls back to the software cursor otherwise.

Sessions do not reconnect automatically. Unexpected disconnects keep the tab open and show an explicit reconnect action.

### Deployment model

The application is designed for one replica, and SQLite is limited to one connection per process. Persist only the application data directory; Guacamole and `guacd` do not store Awsl RemoteX business data. All `/guacamole/*` HTTP and WebSocket traffic is proxied by the Go service, and the public path is currently fixed at `/guacamole`.

Helm places Awsl RemoteX, Guacamole, and `guacd` in one StatefulSet Pod, with a fourth sidecar when PVE VNC Proxy is enabled. Pod containers share loopback addresses. Docker Compose uses separate containers and service-name DNS instead.

### Custom guacd boundary

PVE/QEMU RFB Extended Clipboard first sends a `Notify` and waits for the client to send a `Request` before providing text. The LibVNCClient version used by the official Guacamole 1.6.0 `guacd` image ignores this non-`Provide` message, preventing guest-to-browser updates. The project image builds pinned Apache Guacamole and LibVNCServer sources and adds only the missing text request after a notification.

The patch lives under `build/guacd/patches`. It does not change SSH, RDP, JSON authentication, PVE tokens, or ordinary VNC transport. The manual build workflow pins upstream commits and publishes multi-architecture images with an SBOM and provenance. Deployments that do not need PVE Extended Clipboard can use the official `guacamole/guacd` image.
