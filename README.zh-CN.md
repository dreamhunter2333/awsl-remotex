# Awsl RemoteX

[English](README.md) | **简体中文**

一个专注于 SSH、RDP 和 VNC 的浏览器远程工作台。资产统一放在侧边栏，多个远程会话通过 Tab 同时保持在线。

![Awsl RemoteX 工作区](docs/images/workspace.webp)

## 核心能力

- 基于 Apache Guacamole 1.6.0 支持 SSH、RDP 和 VNC
- 使用 Guacamole 官方 SDK 与 Canvas 直接渲染多个在线会话
- 资产添加、编辑、删除、连接测试及凭据加密保存
- 重连、断开、全屏、软键盘及自定义快捷键
- 响应式布局、可安装 PWA、自动更新和中英文界面
- 可选的应用登录认证与 SQLite 本地存储

Awsl RemoteX 只专注远程控制，不包含录制回放、审批流、命令审计或内网网页代理。

## 快速开始

需要 Docker 和 Compose v2。创建环境文件，并在启动前替换所有示例密钥：

```bash
cp .env.example .env
openssl rand -hex 16
openssl rand -hex 32
```

将 32 字符输出设为 `GUACAMOLE_JSON_SECRET`，64 字符输出设为 `CREDENTIAL_KEY`，并设置高强度 `AUTH_PASSWORD`。留空 `AUTH_PASSWORD` 会禁用应用认证，只应在明确可信的网络中使用。

使用 [compose.yaml](compose.yaml) 从源码构建并启动：

```bash
docker compose up -d --build
```

访问 `http://localhost:8080`。服务只要超出可信内网范围，就应启用 HTTPS。

项目同时发布 `ghcr.io/dreamhunter2333/awsl-remotex` 多架构镜像。镜像部署、反向代理、升级和健康检查参见[部署文档](docs/deployment.md)。

## 使用方式

1. 从侧边栏底部添加 SSH、RDP 或 VNC 资产。
2. 单击资产进行选中，双击立即连接。
3. 在编辑弹窗中修改、测试或删除连接。
4. 通过 Tab 切换在线会话，右侧保留当前会话操作。

活动远程会话连接后，页面级键盘输入会统一路由到该会话；鼠标仍可正常操作其他界面元素。浏览器或操作系统保留的快捷键可能无法被网页捕获。

## 文档

- [文档索引](docs/README.md)
- [架构说明](docs/architecture.md)
- [配置说明](docs/configuration.md)
- [部署说明](docs/deployment.md)
- [运维与故障排查](docs/operations.md)
- [HTTP API](docs/api.md)
- [开发与发版](docs/development.md)
- [变更记录](CHANGELOG.md)
- [安全策略](SECURITY.md)

保存的密码和私钥会使用 AES-256-GCM 加密后写入 SQLite，资产 API 不返回已保存的凭据内容。请妥善保管 `CREDENTIAL_KEY`，丢失后无法恢复已有加密凭据。
