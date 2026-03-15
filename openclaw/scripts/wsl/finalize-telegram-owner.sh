#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <telegram_user_id>" >&2
  exit 1
fi

OWNER_ID="$1"

if [[ ! "${OWNER_ID}" =~ ^[0-9]+$ ]]; then
  echo "Telegram user IDs must be numeric." >&2
  exit 1
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

bash "${SCRIPT_DIR}/start-openclaw.sh" config set --strict-json channels.telegram.allowFrom "[\"${OWNER_ID}\"]"
bash "${SCRIPT_DIR}/start-openclaw.sh" config set channels.telegram.dmPolicy allowlist
bash "${SCRIPT_DIR}/start-openclaw.sh" config set --strict-json channels.telegram.execApprovals.approvers "[\"${OWNER_ID}\"]"
bash "${SCRIPT_DIR}/start-openclaw.sh" config set channels.telegram.execApprovals.target dm
bash "${SCRIPT_DIR}/start-openclaw.sh" config set --strict-json channels.telegram.execApprovals.enabled true

echo "Telegram DM access is now locked to ${OWNER_ID}."
echo "Exec approvals are enabled for that Telegram account."
echo "Restart the gateway if it is already running:"
echo "  bash scripts/wsl/start-openclaw.sh gateway restart"
