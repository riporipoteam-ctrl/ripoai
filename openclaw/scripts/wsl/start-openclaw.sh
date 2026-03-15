#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
ENV_FILE="${OPENCLAW_ENV_FILE:-${HOME}/.openclaw-private/openclaw.env}"

if [[ -f "${ENV_FILE}" ]]; then
  # shellcheck source=/dev/null
  . "${ENV_FILE}"
fi

: "${OPENCLAW_WORKSPACE:=${REPO_ROOT}}"
: "${OPENCLAW_CONFIG_PATH:=${OPENCLAW_WORKSPACE}/config/openclaw.json5}"
: "${OPENCLAW_TELEGRAM_TOKEN_FILE:=${HOME}/.openclaw-private/telegram-bot.token}"

export OPENCLAW_WORKSPACE
export OPENCLAW_CONFIG_PATH
export OPENCLAW_TELEGRAM_TOKEN_FILE

if [[ -z "${OPENCLAW_GATEWAY_TOKEN:-}" ]]; then
  echo "OPENCLAW_GATEWAY_TOKEN is missing. Run scripts/wsl/write-secrets.sh first." >&2
  exit 1
fi

if grep -q 'openrouter/' "${OPENCLAW_CONFIG_PATH}" && [[ -z "${OPENROUTER_API_KEY:-}" ]]; then
  echo "OPENROUTER_API_KEY is missing for an openrouter/* model in the current config." >&2
  exit 1
fi

if grep -q 'huggingface/' "${OPENCLAW_CONFIG_PATH}" && [[ -z "${HF_TOKEN:-}" && -z "${HUGGINGFACE_HUB_TOKEN:-}" ]]; then
  echo "HF_TOKEN or HUGGINGFACE_HUB_TOKEN is missing for a huggingface/* model in the current config." >&2
  exit 1
fi

if grep -q '"provider": "elevenlabs"' "${OPENCLAW_CONFIG_PATH}" && [[ -z "${ELEVENLABS_API_KEY:-}" && -z "${XI_API_KEY:-}" ]]; then
  echo "ELEVENLABS_API_KEY or XI_API_KEY is missing for ElevenLabs voice support in the current config." >&2
  exit 1
fi

if [[ ! -f "${OPENCLAW_CONFIG_PATH}" ]]; then
  echo "Config file not found: ${OPENCLAW_CONFIG_PATH}" >&2
  exit 1
fi

if [[ ! -f "${OPENCLAW_TELEGRAM_TOKEN_FILE}" ]]; then
  echo "Telegram token file not found: ${OPENCLAW_TELEGRAM_TOKEN_FILE}" >&2
  exit 1
fi

if [[ $# -eq 0 ]]; then
  set -- gateway run
fi

exec openclaw "$@"
