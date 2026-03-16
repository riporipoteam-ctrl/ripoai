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
: "${OPENCLAW_READY_TIMEOUT_SECONDS:=90}"

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

validate_telegram_token() {
  local status
  local response_path=/tmp/openclaw-telegram-getme.json

  status="$(curl -sS -o "${response_path}" -w '%{http_code}' --max-time 20 "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe" || true)"
  case "${status}" in
    200)
      return 0
      ;;
    404)
      echo "TELEGRAM_BOT_TOKEN is invalid on Telegram (getMe returned 404)." >&2
      cat "${response_path}" >&2 || true
      exit 1
      ;;
    *)
      echo "Telegram token preflight returned HTTP ${status:-unknown}; continuing startup and letting OpenClaw retry." >&2
      cat "${response_path}" >&2 || true
      ;;
  esac
}

wait_for_gateway() {
  local deadline
  deadline=$((SECONDS + OPENCLAW_READY_TIMEOUT_SECONDS))

  until curl -fsS --max-time 5 "http://127.0.0.1:${OPENCLAW_GATEWAY_PORT}/health" >/dev/null 2>&1; do
    if ! kill -0 "${OPENCLAW_PID}" 2>/dev/null; then
      echo "OpenClaw gateway exited before becoming ready." >&2
      wait "${OPENCLAW_PID}" || true
      exit 1
    fi
    if (( SECONDS >= deadline )); then
      echo "OpenClaw gateway did not become ready within ${OPENCLAW_READY_TIMEOUT_SECONDS}s." >&2
      exit 1
    fi
    sleep 2
  done
}

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

validate_telegram_token

openclaw gateway --bind loopback --port "${OPENCLAW_GATEWAY_PORT}" run &
OPENCLAW_PID=$!

nginx -c /tmp/openclaw-nginx.conf -g 'daemon off;' &
NGINX_PID=$!

(
  echo "Waiting for OpenClaw gateway readiness on 127.0.0.1:${OPENCLAW_GATEWAY_PORT}..."
  if ! wait_for_gateway; then
    kill "${OPENCLAW_PID}" 2>/dev/null || true
    kill "${NGINX_PID}" 2>/dev/null || true
    exit 1
  fi
  echo "OpenClaw gateway is ready."
) &
READY_PID=$!

wait -n "${OPENCLAW_PID}" "${NGINX_PID}"

kill "${READY_PID}" 2>/dev/null || true
