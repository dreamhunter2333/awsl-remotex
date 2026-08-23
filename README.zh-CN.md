# Awsl RemoteX

[English](README.md) | **简体中文**

Awsl RemoteX 是一个轻量、现代的浏览器远程控制工作台，用于在同一个页面中管理 SSH、RDP 和 VNC 连接。

## 功能

- SSH、RDP 和 VNC 远程连接
- 多连接 Tab，可在多个会话之间快速切换
- 单击选中资产，双击直接连接
- 添加、编辑、删除资产及远程连接测试
- 密码与 SSH 私钥加密存储，可自动登录远程主机
- 可完全隐藏的资产侧边栏
- 会话重连、断开和全屏控制
- One Half Dark、One Half Light 与跟随系统主题
- 中文和英文界面
- PWA，可安装到桌面或移动设备
- 可选的全局访问密码
- SQLite 本地存储

## 使用方式

1. 在左侧资产列表底部添加 SSH、RDP 或 VNC 资产。
2. 单击资产进行选中，双击资产立即建立连接。
3. 点击资产右侧的编辑按钮，可修改资产、测试端口或删除资产。
4. 每个连接会打开独立 Tab；Tab 右侧提供重连、全屏和断开操作。
5. 收起侧边栏或调整浏览器窗口时，远程画面会自动适配可用空间。

## Docker Compose

克隆仓库，然后创建 `.env`：

```dotenv
GUACAMOLE_JSON_SECRET=<openssl rand -hex 16 的输出>
CREDENTIAL_KEY=<openssl rand -hex 32 的输出>
AUTH_PASSWORD=
GUACAMOLE_SESSION_TIMEOUT_MINUTES=1440
SESSION_IDLE_TIMEOUT=24h
```

`AUTH_PASSWORD` 可以留空。对外提供服务时，建议设置密码并使用 HTTPS。

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

启动服务后访问 `http://localhost:8080`：

```bash
docker compose up -d --build
```

## 凭据与安全

- 资产可以保存密码或 SSH 私钥，也可以选择不保存凭据。
- 保存的资产凭据使用 AES-256-GCM 加密后写入 SQLite。
- 资产列表和 API 不会返回已保存的密码或私钥。
- 连接测试会使用当前表单中的信息，通过 `guacd` 实际尝试 SSH、RDP 或 VNC 连接。
- `.env`、SQLite 数据库和运行数据默认不会提交到 Git。

## 项目边界

Awsl RemoteX 专注于远程控制，不提供会话录制、录像回放、命令审计、审批流或内网网页代理。
