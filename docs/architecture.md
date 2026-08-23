# Architecture / 架构

## 中文

Awsl RemoteX 采用单体 Go 服务加 Apache Guacamole 网关。React 静态资源嵌入 Go 二进制，业务数据保存在 SQLite；Guacamole 和 `guacd` 只负责远程协议与浏览器画面的转换。

### 模块边界

- `cmd/server`：进程入口和依赖装配。
- `internal/httpapi`：HTTP 路由、认证中间件、资产 API 与静态资源服务。
- `internal/assets`：资产业务规则。
- `internal/database`：SQLite 模式与持久化。
- `internal/credential`：密码和 SSH 私钥的加密、解密。
- `internal/guacamole`：连接票据生成与连接测试。
- `web/src/components`：界面组件；远程画面和会话操作相互独立。
- `web/src/hooks/use-sessions.ts`：多 Tab 会话生命周期、空闲清理及恢复。
- `web/src/lib`：无界面的解析、存储和 Guacamole 按键发送逻辑。

### 连接流程

1. 浏览器向 Go API 请求连接指定资产。
2. 服务端读取并解密凭据，生成短期 Guacamole 连接票据。
3. 前端在同源 iframe 中打开 Guacamole 客户端。
4. Guacamole 通过 `guacd` 建立 SSH、RDP 或 VNC 连接。
5. 关闭 Tab、断开连接或空闲超时时，前端注销 Guacamole token 并清理本地会话状态。

会话不会自动重连。意外断开后，界面保留 Tab 并显示重连提示。

### 部署模型

应用只支持单实例运行，因为 SQLite 数据文件由一个进程持有。Kubernetes 部署中，应用、Guacamole、`guacd` 以及可选的 PVE VNC 代理应位于同一个 Pod，共享网络命名空间；持久卷只挂载到应用的数据目录。

## English

Awsl RemoteX uses a single Go service with an Apache Guacamole gateway. React assets are embedded into the Go binary, business data lives in SQLite, and Guacamole with `guacd` handles remote protocols and browser rendering.

### Boundaries

- `cmd/server`: process entry point and dependency wiring.
- `internal/httpapi`: routing, authentication middleware, asset APIs, and static files.
- `internal/assets`: asset business rules.
- `internal/database`: SQLite schema and persistence.
- `internal/credential`: password and SSH key encryption.
- `internal/guacamole`: connection tickets and connection tests.
- `web/src/components`: UI components with separate viewport and session controls.
- `web/src/hooks/use-sessions.ts`: tab lifecycle, idle cleanup, and restoration.
- `web/src/lib`: UI-independent parsing, persistence, and Guacamole key dispatch.

### Connection lifecycle

1. The browser asks the Go API to connect an asset.
2. The server loads and decrypts its credential, then creates a short-lived Guacamole ticket.
3. The frontend opens the Guacamole client in a same-origin iframe.
4. Guacamole connects to SSH, RDP, or VNC through `guacd`.
5. Closing a tab, disconnecting, or reaching the idle timeout revokes the Guacamole token and clears local session state.

Sessions never reconnect automatically. An unexpected disconnect keeps the tab open and shows an explicit reconnect prompt.

### Deployment model

The application is intentionally single-instance because one process owns the SQLite file. On Kubernetes, the application, Guacamole, `guacd`, and optional PVE VNC proxy should run as containers in one Pod and share its network namespace. Only the application data directory needs persistent storage.
