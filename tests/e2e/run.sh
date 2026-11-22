#!/bin/sh
set -eu

cd "$(dirname "$0")"
project="remotex-e2e-$$"
runner="$project-runner"
export E2E_APP_IMAGE="$project-app"
E2E_ARTIFACTS_DIR="${E2E_ARTIFACTS_DIR:-$PWD/artifacts/$project}"
mkdir -p "$E2E_ARTIFACTS_DIR"
E2E_ARTIFACTS_DIR="$(cd "$E2E_ARTIFACTS_DIR" && pwd)"

if docker compose version >/dev/null 2>&1; then
  compose() { docker compose --file compose.yaml --project-name "$project" "$@"; }
else
  compose() { docker-compose --file compose.yaml --project-name "$project" "$@"; }
fi

cleanup() {
  status=$?
  trap - EXIT INT TERM
  compose logs --no-color > "$E2E_ARTIFACTS_DIR/compose.log" || true
  if docker container inspect "$runner" >/dev/null 2>&1; then
    docker cp "$runner:/artifacts/." "$E2E_ARTIFACTS_DIR" || true
    docker rm -f "$runner" >/dev/null || true
  fi
  compose down --volumes --remove-orphans || true
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

compose build app desktop tests
compose up --detach --no-build --wait --wait-timeout 150 app open-app oidc-app desktop
compose run --name "$runner" --no-deps tests "$@"
