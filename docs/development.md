# Development and releases / 开发与发版

## Toolchain / 工具链

- Go 1.26, as declared by [go.mod](../go.mod)
- Node.js 24, as declared by [.node-version](../.node-version)
- pnpm 11.22.0, as declared by [web/package.json](../web/package.json)

Enable Corepack and install the frontend dependencies:

```bash
corepack enable
pnpm --dir web install --frozen-lockfile
```

## Verification / 验证

Run the same checks used by CI:

```bash
go test -race ./...
go vet ./...
pnpm --dir web test
pnpm --dir web build
```

The repository currently has no separate lint script. TypeScript checking is part of `pnpm --dir web build`.

## Running locally / 本地运行

The simplest complete environment is the source-build Compose stack:

```bash
cp .env.example .env
docker compose up -d --build
```

For frontend development, keep the backend stack on port 8080 and run Vite on its default port:

```bash
pnpm --dir web dev
```

`VITE_PROXY_TARGET` defaults to `http://localhost:8080` and controls the development proxy for `/api` and `/guacamole`. Rebuild or restart the backend container after Go changes.

## Guacamole SDK / Guacamole SDK

The browser SDK is vendored under `web/public/vendor/guacamole/1.6.0`. Its version, source URL, license, and notice must remain synchronized. See [SOURCE.md](../web/public/vendor/guacamole/1.6.0/SOURCE.md).

Do not replace the SDK file without updating `GUACAMOLE_SDK_VERSION`, provenance files, and the compatible Guacamole/`guacd` images.

## Patched guacd / 定制 guacd

The checked-in Compose stack and the separately maintained Helm chart use `ghcr.io/dreamhunter2333/awsl-remotex-guacd:1.6.1`. This image is built through the manually dispatched `Publish patched guacd` workflow, not during an ordinary application release.

The workflow accepts an image tag plus pinned Apache Guacamole and LibVNCServer refs, validates those inputs, clones both sources, applies the two patches under `build/guacd/patches`, and publishes Linux `amd64` and `arm64` images with provenance and an SBOM. It never builds from a moving branch implicitly.

其中 LibVNCClient 补丁仅处理 QEMU Extended Clipboard 的 `Notify` → `Request` 流程；另一个补丁让 Apache Guacamole 的 Docker 构建使用已打补丁的本地 LibVNCServer 源码。普通应用 Tag 不会重复构建 `guacd`。使用说明参见[部署文档](deployment.md)。

## Release flow / 发版流程

CI runs on every push to `main` and on pull requests. A pushed `v*` tag runs the release workflow, repeats all tests, cross-compiles Linux `amd64` and `arm64` binaries, and publishes a multi-architecture GHCR image with version, minor-line, and `latest` tags.

Before tagging:

1. Update [CHANGELOG.md](../CHANGELOG.md) and user-facing documentation.
2. Run all verification commands.
3. Commit and push `main`.
4. Create an annotated semantic-version tag and push it.
5. Wait for the Publish container workflow and verify the UI version badge.
