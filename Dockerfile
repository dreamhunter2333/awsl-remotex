FROM alpine:3.23
ARG TARGETARCH
RUN addgroup -S awsl && adduser -S -G awsl awsl
WORKDIR /app
COPY dist/awsl-remotex-linux-${TARGETARCH} /usr/local/bin/awsl-remotex
COPY web/dist ./web
RUN mkdir -p /app/data && chown -R awsl:awsl /app
USER awsl
ENV ADDR=:8080 DATABASE_PATH=/app/data/awsl-remotex.db WEB_DIR=/app/web
EXPOSE 8080
VOLUME ["/app/data"]
ENTRYPOINT ["awsl-remotex"]
