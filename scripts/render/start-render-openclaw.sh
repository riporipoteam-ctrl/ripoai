#!/usr/bin/env bash
set -euo pipefail

: "${PORT:=10000}"
: "${OPENCLAW_GATEWAY_PORT:=8080}"
: "${OPENCLAW_TELEGRAM_WEBHOOK_PORT:=8787}"
: "${OPENCLAW_STATE_DIR:=/data/openclaw}"
: "${OPENCLAW_WORKSPACE:=/data/workspace}"
: "${OPENCLAW_CONFIG_PATH:=/app/config/render.openclaw.json5}"
: "${OPENCLAW_MODEL:=huggingface/Qwen/Qwen3-8B}"
: "${TELEGRAM_OWNER_ID:=7428637111}"

if [[ -z "${OPENCLAW_DASHBOARD_PASSWORD:-}" ]]; then
  echo "OPENCLAW_DASHBOARD_PASSWORD is required for hosted dashboard access." >&2
  exit 1
fi

if [[ -z "${TELEGRAM_BOT_TOKEN:-}" ]]; then
  echo "TELEGRAM_BOT_TOKEN is required for Telegram hosting." >&2
  exit 1
fi

if [[ -z "${TELEGRAM_WEBHOOK_SECRET:-}" ]]; then
  echo "TELEGRAM_WEBHOOK_SECRET is required for Telegram webhook mode." >&2
  exit 1
fi

if [[ -z "${HF_TOKEN:-}" && -z "${HUGGINGFACE_HUB_TOKEN:-}" ]]; then
  echo "HF_TOKEN or HUGGINGFACE_HUB_TOKEN is required for the default Hugging Face model." >&2
  exit 1
fi

if [[ -z "${RENDER_EXTERNAL_URL:-}" ]]; then
  echo "RENDER_EXTERNAL_URL is missing. Render should provide this automatically." >&2
  exit 1
fi

if [[ -z "${HUGGINGFACE_HUB_TOKEN:-}" && -n "${HF_TOKEN:-}" ]]; then
  export HUGGINGFACE_HUB_TOKEN="${HF_TOKEN}"
fi

if [[ -z "${HF_TOKEN:-}" && -n "${HUGGINGFACE_HUB_TOKEN:-}" ]]; then
  export HF_TOKEN="${HUGGINGFACE_HUB_TOKEN}"
fi

mkdir -p "${OPENCLAW_STATE_DIR}" "${OPENCLAW_WORKSPACE}" /tmp/openclaw-compile-cache /run/nginx

envsubst '${PORT} ${OPENCLAW_GATEWAY_PORT} ${OPENCLAW_TELEGRAM_WEBHOOK_PORT}' \
  < /app/scripts/render/nginx.conf.template \
  > /tmp/openclaw-nginx.conf

cleanup() {
  if [[ -n "${OPENCLAW_PID:-}" ]]; then
    kill "${OPENCLAW_PID}" 2>/dev/null || true
  fi
  if [[ -n "${NGINX_PID:-}" ]]; then
    kill "${NGINX_PID}" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

openclaw config validate >/dev/null

openclaw gateway --bind lan --port "${OPENCLAW_GATEWAY_PORT}" run &
OPENCLAW_PID=$!

sleep 3

nginx -c /tmp/openclaw-nginx.conf -g 'daemon off;' &
NGINX_PID=$!

wait -n "${OPENCLAW_PID}" "${NGINX_PID}"
