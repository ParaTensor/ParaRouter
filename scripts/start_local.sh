#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
HUB_PORT="${HUB_PORT:-3399}"
WEB_HOST="${WEB_HOST:-127.0.0.1}"
DATABASE_URL="${DATABASE_URL:-postgresql://xinference:password@localhost:5432/pararouter}"

hub_pid=""
gateway_pid=""
web_pid=""

cleanup() {
  local exit_code=$?

  for pid in "$web_pid" "$gateway_pid" "$hub_pid"; do
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
    fi
  done

  exit "$exit_code"
}

trap cleanup EXIT INT TERM

cd "$ROOT_DIR"

echo "Starting ParaRouter local services..."
echo "  Hub:     http://127.0.0.1:${HUB_PORT}"
echo "  Gateway: http://127.0.0.1:8000"
echo "  Web:     http://${WEB_HOST}:5173"
echo

PORT="$HUB_PORT" npm run dev --prefix hub &
hub_pid=$!

DATABASE_URL="$DATABASE_URL" cargo run --manifest-path gateway/Cargo.toml &
gateway_pid=$!

npm run dev --prefix web -- --host "$WEB_HOST" &
web_pid=$!

echo "PIDs: hub=${hub_pid} gateway=${gateway_pid} web=${web_pid}"
echo "Press Ctrl+C to stop all services."
echo

wait "$hub_pid" "$gateway_pid" "$web_pid"