# Private OpenClaw Telegram Bot

This repo now holds the redacted OpenClaw config, WSL bootstrap helpers, and the workspace skill for the private Telegram bot.

## What Is Ready

1. `config/openclaw.json5` keeps the runtime reproducible without storing secrets in git.
2. `scripts/windows/install-wsl.ps1` handles the one admin-only bootstrap step that this non-elevated session could not complete.
3. `scripts/wsl/install-openclaw.sh` installs Node 22, `openclaw@latest`, Playwright, and a Chromium-based browser inside Ubuntu.
4. `scripts/wsl/write-secrets.sh` writes the Telegram token, OpenRouter key, and gateway token into `~/.openclaw-private/` with tight file permissions.
5. `scripts/wsl/start-openclaw.sh` loads the private env, points `OPENCLAW_CONFIG_PATH` at this repo, and runs any OpenClaw command.
6. `scripts/wsl/finalize-telegram-owner.sh <telegram_user_id>` converts the bot from first-run pairing to a durable owner allowlist and enables Telegram exec approvals for that one account.

## Bootstrap Order

1. Open an elevated PowerShell window and run `.\scripts\windows\install-wsl.ps1`.
2. Reboot if Windows asks for it, then open Ubuntu.
3. In Ubuntu, run `cd /mnt/c/Users/ripot/Desktop/projects/openclaw`.
4. Run `bash scripts/wsl/install-openclaw.sh`.
5. Run `TELEGRAM_BOT_TOKEN=... OPENROUTER_API_KEY=... bash scripts/wsl/write-secrets.sh`.
6. Run `bash scripts/wsl/start-openclaw.sh config validate`.
7. Run `bash scripts/wsl/start-openclaw.sh doctor`.
8. Run `bash scripts/wsl/start-openclaw.sh gateway run`.
9. In another Ubuntu tab, run `bash scripts/wsl/start-openclaw.sh dashboard --no-open` or `bash scripts/wsl/start-openclaw.sh status --deep`.

## First Telegram Pairing

1. DM the bot from your Telegram account.
2. In Ubuntu, run `bash scripts/wsl/start-openclaw.sh pairing list telegram`.
3. Approve the pending code with `bash scripts/wsl/start-openclaw.sh pairing approve telegram <code>`.
4. Find your numeric Telegram user ID from `bash scripts/wsl/start-openclaw.sh logs --follow` and watch for `from.id`.
5. Lock the bot to your account with `bash scripts/wsl/finalize-telegram-owner.sh <telegram_user_id>`.

## Notes

- `web_fetch` is enabled and the browser tool is allowed.
- `web_search` is intentionally pointed at Brave without a Brave API key, so it stays available but returns a setup hint instead of silently consuming the OpenRouter key.
- Rotate the Telegram bot token and OpenRouter API key after the first successful deployment because they were pasted into chat during bootstrap.
