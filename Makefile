.PHONY: dev build check e2e

dev:
	go run ./cmd/server

build:
	pnpm --dir web build
	go build ./cmd/server

check:
	go test ./...
	pnpm --dir web build

e2e:
	./tests/e2e/run.sh
