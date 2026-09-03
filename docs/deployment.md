# Deployment / 部署

Awsl RemoteX requires three cooperating processes: the Go application, Apache Guacamole, and `guacd`. Docker Compose runs them as separate services. The Helm chart runs them as containers in one single-replica StatefulSet Pod. An optional `pve-vnc-proxy` process can be added for Proxmox VE QEMU consoles.

Awsl RemoteX 由 Go 应用、Apache Guacamole 和 `guacd` 三部分组成。Docker Compose 将它们作为三个服务运行；Helm Chart 将它们作为容器放入同一个单副本 StatefulSet Pod。接入 PVE QEMU 控制台时可额外启用 `pve-vnc-proxy`。

## Secrets / 密钥

Generate independent values before a Docker deployment:

```bash
openssl rand -hex 16
openssl rand -hex 32
```

- `GUACAMOLE_JSON_SECRET`: first output, exactly 32 hexadecimal characters / 第一条输出，必须是 32 个十六进制字符。
- `CREDENTIAL_KEY`: second output, exactly 64 hexadecimal characters / 第二条输出，必须是 64 个十六进制字符。
- `AUTH_PASSWORD`: a separate strong application login password / 独立的高强度应用登录密码。
- `AUTH_USERNAME`: defaults to `admin` / 默认登录账号为 `admin`。

`GUACAMOLE_JSON_SECRET` must be identical in RemoteX and Guacamole. Preserve `CREDENTIAL_KEY` for the lifetime of the SQLite database; changing it makes saved credentials unreadable. An empty `AUTH_PASSWORD` disables login and is suitable only for an intentionally trusted network.

RemoteX 与 Guacamole 使用的 `GUACAMOLE_JSON_SECRET` 必须一致。只要继续使用原 SQLite 数据库，就必须保留原 `CREDENTIAL_KEY`；修改后已有凭据无法解密。`AUTH_PASSWORD` 留空会关闭应用登录，只适用于明确可信的网络。

Helm can generate and retain these values in a Kubernetes Secret. The examples still set an explicit login password so the installation never starts with an unknown application password. Helm 可以生成并复用这些 Secret；示例仍显式设置登录密码。

## Docker Compose

### Build from source / 从源码构建

```bash
git clone https://github.com/dreamhunter2333/awsl-remotex.git
cd awsl-remotex
cp .env.example .env
```

Edit `.env`, replace all placeholder values, then start / 编辑 `.env` 并替换全部占位值后启动：

```bash
docker compose up -d --build
docker compose ps
curl --fail --silent --show-error --retry 30 --retry-all-errors --retry-delay 2 \
  http://127.0.0.1:8080/api/ready
```

Open `http://127.0.0.1:8080`. Application data is stored in `./data` and mounted at `/app/data`. 访问该地址即可，应用数据保存在 `./data`。

### Use the published image / 使用发布镜像

Set the application image in `.env`:

```dotenv
AWSL_REMOTEX_IMAGE=ghcr.io/dreamhunter2333/awsl-remotex:latest
```

Then pull and start without compiling / 拉取镜像并跳过本地编译：

```bash
docker compose pull
docker compose up -d --no-build
```

`latest` tracks the latest stable release. Use a full tag such as `v0.2.25` for a reproducible deployment. Images support Linux `amd64` and `arm64`. `latest` 跟随稳定版；需要可复现部署时应固定完整版本。

## Proxmox VE VNC Proxy / Proxmox VE VNC 代理

The optional [`pve-vnc-proxy`](https://github.com/dreamhunter2333/pve-vnc-proxy) turns a normal VNC connection into a temporary PVE QEMU console session. It receives the node, VMID, API Token ID, and Token Secret through VNC authentication, requests a console ticket, and bridges the PVE WebSocket. The proxy itself does not persist tokens or tickets and currently supports QEMU VMs only. When an asset uses a saved password, RemoteX encrypts its Token Secret and stores it in SQLite.

可选代理会把标准 VNC 连接转换成临时 PVE QEMU 控制台会话。它从 VNC 认证信息中读取节点、VMID、API Token ID 与 Secret，申请临时票据并桥接 PVE WebSocket；代理自身不持久化 Token 或票据，目前只支持 QEMU VM。资产选择“保存密码”时，RemoteX 会加密 Token Secret 并存入 SQLite。

在 PVE 中创建启用 **Privilege Separation** 的 API Token，并在目标 `/vms/<vmid>` 上授予 `PVEVMUser`。Token 所属用户也必须拥有有效权限。CLI 示例使用的名称和 VMID 均为占位值：

```bash
pveum user token add root@pam remotex -privsep 1
pveum acl modify /vms/105 -token 'root@pam!remotex' -role PVEVMUser
pveum user token permissions root@pam remotex
```

Docker Compose 在 `.env` 中配置 PVE 地址。只有可信私网中的证书无法验证时才设置 `PVE_INSECURE=true`：

```dotenv
PVE_HOST=https://pve.example.com:8006
PVE_INSECURE=false
PVE_MAX_CONNS=256
```

```bash
docker compose --profile pve up -d
```

Helm 中通过后文的 `pveVncProxy.enabled` 启用 Sidecar。然后创建 VNC 资产：

| Field / 字段 | Docker Compose | Helm/Kubernetes |
| --- | --- | --- |
| Host / 主机 | `pve-vnc-proxy` | `127.0.0.1` |
| Port / 端口 | `5900` | `5900` |
| Username / 用户名 | `<node>@<vmid>@<token-id>` | `<node>@<vmid>@<token-id>` |
| Authentication / 认证 | Saved password / 保存密码 | Saved password / 保存密码 |
| Password / 密码 | PVE Token Secret | PVE Token Secret |

用户名示例为 `pve@105@root@pam!remotex`：`pve` 是节点名，`105` 是 VMID，`root@pam!remotex` 是完整 Token ID。密码只填 Token Secret，不加 `PVEAPIToken=` 前缀。保存后先测试连接，再双击资产。

项目默认使用 `ghcr.io/dreamhunter2333/awsl-remotex-guacd:1.6.1`。PVE/QEMU Extended Clipboard 会先发送 `Notify`，等待 VNC 客户端发送 `Request` 后才返回文本；Guacamole 1.6.0 官方 `guacd` 镜像所用的 LibVNCClient 会忽略该通知，导致 Guest 中复制的内容无法回到浏览器。定制镜像从固定提交的 Apache Guacamole 与 LibVNCServer 源码构建，只补充这个文本请求，不修改 SSH、RDP、认证、PVE Token 或普通 VNC。补丁与构建流程位于 [`build/guacd`](../build/guacd) 和 [构建工作流](../.github/workflows/build-guacd.yml)。

PVE Windows 还需要在 VM 的 `Hardware` → `Display` 中启用 Clipboard `VNC`，并在 Guest 内安装 Windows SPICE Guest Tools；QEMU Guest Agent 本身不够。RemoteX 资产的“高级设置”中启用自定义 VNC 参数，把“剪贴板编码”设为 `UTF-8`，其他高级项保持默认，修改后重新连接。这里只同步文本，不传文件。

不需要 PVE Extended Clipboard 时可以将 Compose 或 Helm 的 `guacd` 镜像改回 `guacamole/guacd:1.6.0`；PVE Guest 到浏览器的剪贴板可能失效，但普通 SSH 和 RDP 不受影响。

## Kubernetes with Helm

### Install / 安装

The chart currently lives in the Helm charts source repository / Chart 当前位于 Helm Charts 源码仓库：

```bash
git clone https://github.com/dreamhunter2333/helm-charts.git
cd helm-charts
helm upgrade --install awsl-remotex ./awsl-remotex \
  --namespace default \
  --set-string auth.username=admin \
  --set-string auth.password='replace-with-a-strong-password' \
  --wait --timeout 10m
```

The chart creates one StatefulSet replica, one PVC, a ClusterIP Service, and a Secret. It starts three containers by default:

- `awsl-remotex`: HTTP service on Pod port 8081 / RemoteX HTTP 服务；
- `guacamole`: internal HTTP service on Pod port 8080 / 内部 Guacamole HTTP 服务；
- `guacd`: remote protocol daemon on Pod port 4822 / 远程协议守护进程。

The Service exposes only RemoteX on port 80. SQLite is stored on the PVC. Do not increase the StatefulSet replica count or mount the same SQLite volume into another RemoteX process.

Service 只暴露 RemoteX 的 80 端口，SQLite 保存在 PVC。不要增加 StatefulSet 副本，也不要让其他 RemoteX 进程挂载同一 SQLite 数据卷。

### Use an existing Secret / 使用已有 Secret

Create a Secret containing all four required keys / 创建包含以下四个键的 Secret：

```bash
kubectl -n default create secret generic awsl-remotex-secrets \
  --from-literal=auth-username='admin' \
  --from-literal=auth-password='replace-with-a-strong-password' \
  --from-literal=credential-key="$(openssl rand -hex 32)" \
  --from-literal=guacamole-json-secret="$(openssl rand -hex 16)"

helm upgrade --install awsl-remotex ./awsl-remotex \
  --namespace default \
  --set auth.existingSecret=awsl-remotex-secrets \
  --wait --timeout 10m
```

When the chart manages the Secret and `auth.password` is omitted, it generates a random login password. Read the generated credentials with:

```bash
kubectl -n default get secret awsl-remotex \
  -o jsonpath='{.data.auth-username}' | base64 -d; echo
kubectl -n default get secret awsl-remotex \
  -o jsonpath='{.data.auth-password}' | base64 -d; echo
```

An upgrade reuses the existing generated values. Deleting the Helm release can delete its managed Secret, so preserve the Secret and `CREDENTIAL_KEY` before uninstalling when saved asset credentials exist.

升级会复用已有随机值；卸载 Release 可能同时删除 Chart 管理的 Secret。存在已保存凭据时，应在卸载前保留 Secret 和 `CREDENTIAL_KEY`。

### Values file and Ingress / Values 与 Ingress

Example `remotex-values.yaml`:

```yaml
auth:
  username: admin
  password: "replace-with-a-strong-password"

ingress:
  enabled: true
  className: traefik
  hosts:
    - host: remotex.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: remotex-example-com-tls
      hosts:
        - remotex.example.com

pveVncProxy:
  enabled: true
  env:
    PVE_HOST: "https://pve.example.com:8006"
    PVE_LISTEN: "127.0.0.1:5900"
    PVE_INSECURE: "false"
    PVE_MAX_CONNS: "256"
```

```bash
helm upgrade --install awsl-remotex ./awsl-remotex \
  --namespace default \
  -f remotex-values.yaml \
  --wait --timeout 10m
```

When the PVE sidecar is enabled, the Pod has four containers. Use `127.0.0.1:5900` in the VNC asset because all Pod containers share one network namespace. 启用后仍是一个 Pod，只是从三个容器变成四个容器。

Without Ingress, access the ClusterIP Service through port-forwarding / 未配置 Ingress 时使用端口转发：

```bash
kubectl -n default port-forward service/awsl-remotex 8080:80
```

## Reverse proxy and HTTPS / 反向代理与 HTTPS

Forward the complete origin to RemoteX, including:

- `/api/*`;
- `/guacamole/*`;
- static application files;
- WebSocket upgrade requests.

Do not strip or rewrite `/guacamole`. Preserve `Host`, and set `X-Forwarded-Proto: https` when TLS terminates at the proxy. 不要删除或重写 `/guacamole`；保留 `Host`，并在前置代理终结 TLS 时设置 `X-Forwarded-Proto: https`。剪贴板、安全 Cookie 与 PWA 应通过 HTTPS 使用。

If Cloudflare Tunnel runs in the same Kubernetes cluster, target the Service DNS name:

```text
http://awsl-remotex.default:80
```

If the tunnel runs in a different namespace, use the full name `http://awsl-remotex.default.svc.cluster.local:80`.

## Health checks / 健康检查

- `GET /api/health`: Go process liveness.
- `GET /api/ready`: SQLite, `guacd`, and Guacamole readiness.

Both endpoints are available without application login / 两个端点均不要求应用登录。

Docker:

```bash
curl --fail http://127.0.0.1:8080/api/ready
docker compose logs --tail=100 awsl-remotex guacamole guacd
```

Kubernetes:

```bash
kubectl -n default get pod -l app.kubernetes.io/instance=awsl-remotex
kubectl -n default rollout status statefulset/awsl-remotex
kubectl -n default logs statefulset/awsl-remotex -c awsl-remotex --tail=100
```

## Upgrade / 升级

Docker image deployment:

```bash
docker compose pull
docker compose up -d --no-build
curl --fail --silent --show-error --retry 30 --retry-all-errors --retry-delay 2 \
  http://127.0.0.1:8080/api/ready
```

Helm deployment:

```bash
git -C helm-charts pull --ff-only
helm upgrade awsl-remotex ./helm-charts/awsl-remotex \
  --namespace default \
  -f remotex-values.yaml \
  --wait --timeout 10m
kubectl -n default rollout status statefulset/awsl-remotex
```

Use the same values file as the installation. `--reuse-values` is acceptable for an installation managed entirely through command-line values, but review newly introduced chart defaults before relying on it. 升级时应复用安装时的 values 文件；完全依赖命令行管理的部署可以使用 `--reuse-values`，但要留意新版本增加的默认参数。

Keep the same `CREDENTIAL_KEY` and persistent volume. The application performs forward SQLite schema updates during startup; do not downgrade without a tested database backup. 必须保留原密钥和数据卷，未经备份验证不要降级。
