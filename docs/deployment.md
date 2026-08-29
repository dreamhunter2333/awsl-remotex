# Deployment / 部署

## Source build / 源码构建

The checked-in [compose.yaml](../compose.yaml) builds `Dockerfile.dev`, starts Awsl RemoteX, Guacamole 1.6.0, and `guacd` 1.6.0, and persists application data in `./data`.

仓库中的 [compose.yaml](../compose.yaml) 使用 `Dockerfile.dev` 构建，同时启动 Awsl RemoteX、Guacamole 1.6.0 和 `guacd` 1.6.0，并将应用数据持久化到 `./data`。

```bash
cp .env.example .env
docker compose up -d --build
```

Replace every placeholder in `.env` first. Open `http://localhost:8080` after the stack becomes ready.

## Published image / 发布镜像

Release tags publish Linux `amd64` and `arm64` images to `ghcr.io/dreamhunter2333/awsl-remotex`. Add a local `compose.image.yaml` override:

```yaml
services:
  awsl-remotex:
    image: ${AWSL_REMOTEX_IMAGE:-ghcr.io/dreamhunter2333/awsl-remotex:latest}
```

Then pull and start without invoking the source build:

```bash
docker compose -f compose.yaml -f compose.image.yaml pull
docker compose -f compose.yaml -f compose.image.yaml up -d --no-build
```

Use `latest` to track the stable line when pulling, the `0.2` tag for the current minor line, or a full version such as `0.2.14` for reproducible deployment. Compose does not update a running container automatically; run the pull and recreate commands below to apply a newer image.

发布标签会生成 Linux `amd64` 和 `arm64` 镜像。拉取时，`latest` 跟随稳定版，`0.2` 跟随当前次版本线，完整版本号适合固定部署。Compose 不会自动更新运行中的容器，仍需执行下方的拉取和重建命令。

## Reverse proxy and HTTPS / 反向代理与 HTTPS

Forward the complete origin to port 8080, including `/api/*`, `/guacamole/*`, static files, and WebSocket upgrade requests. Do not strip or rewrite `/guacamole`; the direct client currently requires that exact path. Preserve `Host` and set `X-Forwarded-Proto: https` so authentication cookies are marked secure.

应将完整站点转发到 8080 端口，包括 `/api/*`、`/guacamole/*`、静态文件和 WebSocket 升级请求。不要删除或重写 `/guacamole`。保留 `Host`，并设置 `X-Forwarded-Proto: https`，使登录 Cookie 带上安全属性。

Use HTTPS whenever clients access the service outside an intentionally trusted network. Clipboard APIs and installed-PWA behavior may also depend on a secure browser context.

## Health checks / 健康检查

- `GET /api/health`: liveness; returns success when the Go HTTP process is responding.
- `GET /api/ready`: readiness; checks SQLite, `guacd`, and the Guacamole HTTP service.

Both endpoints are intentionally available without application login. A load balancer should route user traffic only after `/api/ready` succeeds.

## Replicas and storage / 副本与存储

Run one Awsl RemoteX replica per SQLite data directory. Persist `/app/data` for the published image. Guacamole and `guacd` do not require access to this directory.

每个 SQLite 数据目录只运行一个 Awsl RemoteX 副本，并持久化发布镜像的 `/app/data`。Guacamole 与 `guacd` 不需要访问该目录。

## Upgrade / 升级

1. Back up the data directory and preserve `.env`, especially `CREDENTIAL_KEY`.
2. Pull the desired image or source revision.
3. Recreate the stack.
4. Confirm `/api/ready`. For published-image deployments, open the UI and verify its version badge; local source builds display `dev` unless `APP_VERSION` or `GITHUB_REF_NAME` is provided during the frontend build.

```bash
docker compose -f compose.yaml -f compose.image.yaml pull
docker compose -f compose.yaml -f compose.image.yaml up -d --no-build
```

The application adds known SQLite columns during startup. Do not downgrade without a tested backup.
