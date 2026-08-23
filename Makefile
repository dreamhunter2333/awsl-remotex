.PHONY: dev build check

dev:
	go run ./cmd/server

build:
	pnpm --dir web build
	go build ./cmd/server

check:
	go test ./...
	pnpm --dir web build
