# Awsl RemoteX

Awsl-RemoteX 是一个轻量、浏览器端的远程控制工作台。

## 范围

- SSH
- RDP
- VNC
- 多连接持久 Tab
- 可完全隐藏的资产侧边栏
- 资产增删改查与端口连通测试
- 单资产加密凭据与自动登录
- 中英文、One Half 深浅主题、同步配色的 SSH 终端与 PWA
- 可选全局登录密码
- SQLite 本地存储
- Apache Guacamole 远程协议栈

项目不提供会话录制、录像回放、命令审计、审批流和内网网页代理。

## 技术栈

- Go
- SQLite（WAL）
- React + TypeScript + Vite
- shadcn/ui 风格的本地组件
- Apache Guacamole 1.6.0

## 本地开发

```bash
pnpm --dir web install
pnpm --dir web dev
go run ./cmd/server
```

前端开发服务器监听 `5173`，并将 `/api` 转发到 Go 服务的 `8080` 端口。

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `ADDR` | `:8080` | Go HTTP 服务监听地址 |
| `DATABASE_PATH` | `data/awsl-remotex.db` | SQLite 数据库路径 |
| `WEB_DIR` | `web/dist` | 前端构建产物目录 |
| `AUTH_PASSWORD` | 空 | 可选的全局登录密码；留空即关闭 Awsl-RemoteX 认证 |
| `CREDENTIAL_KEY` | 无 | 使用 AES-256-GCM 加密资产凭据的 64 位随机十六进制密钥 |
| `GUACAMOLE_JSON_SECRET` | 空 | Guacamole JSON 认证使用的 32 位随机十六进制密钥 |
| `GUACAMOLE_UPSTREAM` | 空 | Guacamole Web 服务地址；Compose 中为 `http://guacamole:8080` |
| `GUACAMOLE_PUBLIC_PATH` | `/guacamole` | 浏览器访问 Guacamole 的同源路径 |
| `GUACAMOLE_SESSION_TIMEOUT_MINUTES` | `1440` | Guacamole 认证会话允许空闲的分钟数；不限制正在传输的远程连接时长 |

生成密钥后即可启动完整协议栈：

```bash
cp .env.example .env
# GUACAMOLE_JSON_SECRET 使用：openssl rand -hex 16
# CREDENTIAL_KEY 使用：openssl rand -hex 32
docker compose up --build
```

## 发布镜像

普通分支 Push 不会构建或发布镜像。推送 `v*` 格式的 Git Tag 后，GitHub Actions 会发布 `linux/amd64` 和 `linux/arm64` 镜像：

```bash
git tag v0.1.0
git push origin v0.1.0
```

镜像地址：`ghcr.io/dreamhunter2333/awsl-remotex`。
