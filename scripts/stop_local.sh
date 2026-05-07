#!/usr/bin/env bash

set -euo pipefail

HUB_PORT="${HUB_PORT:-3322}"
GATEWAY_PORT="${GATEWAY_PORT:-8000}"
WEB_PORT="${WEB_PORT:-5173}"

stop_port() {
  local name="$1"
  local port="$2"
  local pids

  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN || true)"
  if [[ -z "$pids" ]]; then
    echo "$name is not running on port $port"
    return 0
  fi

  echo "Stopping $name on port $port: $pids"
  kill $pids
}

stop_port "Hub" "$HUB_PORT"
stop_port "Gateway" "$GATEWAY_PORT"
stop_port "Web" "$WEB_PORT"