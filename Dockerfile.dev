FROM node:24-alpine AS web-build
WORKDIR /src/web
RUN corepack enable
COPY web/package.json web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
RUN pnpm build

FROM golang:1.26-alpine AS go-build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd/ ./cmd/
COPY internal/ ./internal/
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/awsl-remotex ./cmd/server

FROM alpine:3.23
RUN addgroup -S awsl && adduser -S -G awsl awsl
WORKDIR /app
COPY --from=go-build /out/awsl-remotex /usr/local/bin/awsl-remotex
COPY --from=web-build /src/web/dist ./web
RUN mkdir -p /app/data && chown -R awsl:awsl /app
USER awsl
ENV ADDR=:8080 DATABASE_PATH=/app/data/awsl-remotex.db WEB_DIR=/app/web
EXPOSE 8080
VOLUME ["/app/data"]
ENTRYPOINT ["awsl-remotex"]
