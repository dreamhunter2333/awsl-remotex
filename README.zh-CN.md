# Awsl RemoteX

[English](README.md) | **简体中文**

一个专注于 SSH、RDP 和 VNC 的浏览器远程工作台。资产统一放在侧边栏，多个远程会话通过 Tab 同时保持在线。

![Awsl RemoteX 工作区](docs/images/workspace.webp)

## 核心能力

- 基于 Apache Guacamole 支持 SSH、RDP 和 VNC
- 使用 Guacamole 官方 SDK 与 Canvas 直接渲染多个在线会话
- 资产添加、编辑、删除、连接测试及凭据加密保存
- 重连、断开、全屏、软键盘及自定义快捷键
- 响应式布局、可安装 PWA、自动更新和中英文界面
- 可选的应用登录认证与 SQLite 本地存储

Awsl RemoteX 只专注远程控制，不包含录制回放、审批流、命令审计或内网网页代理。

## Docker Compose 部署

需要 Docker 和 Compose v2。克隆仓库、创建环境文件，并替换示例密码和密钥：

```bash
git clone https://github.com/dreamhunter2333/awsl-remotex.git
cd awsl-remotex
cp .env.example .env
openssl rand -hex 16
openssl rand -hex 32
```

将 32 字符输出设为 `GUACAMOLE_JSON_SECRET`，64 字符输出设为 `CREDENTIAL_KEY`，并设置高强度 `AUTH_PASSWORD`。留空 `AUTH_PASSWORD` 会禁用应用认证，只应在明确可信的网络中使用。

从源码构建并启动：

```bash
docker compose up -d --build
docker compose ps
curl --fail --silent --show-error --retry 30 --retry-all-errors --retry-delay 2 \
  http://127.0.0.1:8080/api/ready
```

如果不想本地编译，可直接使用发布镜像：

```bash
AWSL_REMOTEX_IMAGE=ghcr.io/dreamhunter2333/awsl-remotex:latest \
  docker compose pull
AWSL_REMOTEX_IMAGE=ghcr.io/dreamhunter2333/awsl-remotex:latest \
  docker compose up -d --no-build
```

访问 `http://localhost:8080`。服务只要超出可信内网范围，就应启用 HTTPS。固定版本、反向代理、升级和健康检查参见[部署文档](docs/deployment.md)。

## Kubernetes + Helm 部署

Helm Chart 使用一个单副本 `StatefulSet`，将 Awsl RemoteX、Guacamole 与 `guacd` 放在同一个 Pod，并用 PVC 保存 SQLite：

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

访问 `http://localhost:8080`。Ingress、已有 Secret、资源限制和升级方式参见[部署文档](docs/deployment.md)。

## Proxmox VE VNC 控制台

可选的 `pve-vnc-proxy` 会把标准 VNC 连接转换为短期 PVE QEMU 控制台会话。代理本身无状态，不持久化 PVE Token；如果资产选择“保存密码”，RemoteX 会将 Token Secret 加密后存入 SQLite。Compose 启用 `pve` profile 后，资产地址填写 `pve-vnc-proxy:5900`；Helm 中它与 `guacd` 共享 Pod 网络，因此填写 `127.0.0.1:5900`。

Docker `.env`：

```dotenv
PVE_HOST=https://pve.example.com:8006
PVE_INSECURE=false
PVE_MAX_CONNS=256
```

```bash
docker compose --profile pve up -d
```

Helm values：

```yaml
pveVncProxy:
  enabled: true
  env:
    PVE_HOST: "https://pve.example.com:8006"
    PVE_LISTEN: "127.0.0.1:5900"
    PVE_INSECURE: "false"
    PVE_MAX_CONNS: "256"
```

将以上内容保存为 `remotex-values.yaml`，然后安装或升级：

```bash
helm upgrade --install awsl-remotex ./awsl-remotex \
  --namespace default \
  --set-string auth.username=admin \
  --set-string auth.password='replace-with-a-strong-password' \
  -f remotex-values.yaml \
  --wait --timeout 10m
```

创建 VNC 资产时，Compose 的主机填写 `pve-vnc-proxy`，Helm 填写 `127.0.0.1`；端口为 `5900`，用户名为 `<node>@<vmid>@<token-id>`，认证选择“保存密码”，密码填写 PVE Token Secret。Token 需要在目标 `/vms/<vmid>` 上拥有 `PVEVMUser`。PVE Windows 剪贴板还要在 PVE 中启用 VNC Clipboard、在 Guest 内安装 SPICE Guest Tools，然后在资产高级设置中启用自定义 VNC 参数并将剪贴板编码设为 `UTF-8`。

项目使用的 `guacd` 由固定版本的 Apache Guacamole 源码构建，只对 LibVNCClient 打了一个很小的补丁。QEMU 会先通知剪贴板发生变化，再等待客户端主动请求内容；Guacamole 1.6.0 官方 `guacd` 镜像所用的 LibVNCClient 会忽略这个通知。补丁补发请求，使 PVE Guest 的剪贴板内容能够回传浏览器，不会改变 SSH、RDP、认证或普通 VNC 的连接逻辑。

完整配置、官方 `guacd` 回退、反向代理要求和故障排查参见[部署文档](docs/deployment.md)。

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
