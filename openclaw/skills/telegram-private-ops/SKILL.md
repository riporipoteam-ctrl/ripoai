---
name: telegram-private-ops
description: Operate a private OpenClaw bot that lives on Telegram. Use when the active workspace contains the bot's redacted OpenClaw config and WSL bootstrap scripts, and the task is to run, validate, pair, harden, or maintain that Telegram deployment without leaking secrets into the repo.
---

# Telegram Private Ops

Keep the Telegram bot private, predictable, and safe to operate from chat.
Prefer the repo helpers and first-class OpenClaw tools over ad-hoc shell work.

## Operating Rules

1. Load the active environment from `~/.openclaw-private/openclaw.env` before running OpenClaw commands.
2. Use `scripts/wsl/start-openclaw.sh` for `openclaw` commands so `OPENCLAW_CONFIG_PATH`, `OPENCLAW_WORKSPACE`, `OPENCLAW_GATEWAY_TOKEN`, and the Telegram token file stay aligned with this repo.
3. Treat `config/openclaw.json5` as redacted infrastructure config. Do not write live tokens into the repo.
4. Keep Telegram DM access private. First-run flow is `dmPolicy: "pairing"`, then switch to `allowlist` with the owner's numeric Telegram user ID once pairing succeeds.
5. Keep exec conservative. Until the owner ID is known, assume host exec should fail closed. After the owner ID is known, use Telegram exec approvals for that one account only.

## Tool Choice

Prefer these OpenClaw capabilities when answering or acting:

- Use `web_fetch` for normal article and documentation URLs.
- Use `browser` for JS-heavy pages, login-required pages, and tasks that need a real interactive browser.
- Use sub-agents for long research or ops tasks that benefit from background work, but keep the fan-out small and deliberate.
- Use filesystem and session tools directly for repo work instead of inventing shell-only workflows.
- Use exec sparingly and only when the task really needs host commands.

## Voice and Audio

- Telegram can send voice-note replies through `messages.tts`; prefer that over promising live calls.
- When the user explicitly asks for audio, use OpenClaw TTS tags so the reply can be rendered as a Telegram voice note.
- Do not promise real phone calls or live call sessions unless the `voice-call` plugin, a telephony provider, and a public webhook are actually configured.

## Telegram Reply Style

- Keep replies chunk-safe for Telegram.
- Prefer concise paragraphs over large code dumps.
- If an action is risky, ask for approval or explain the blocker before proceeding.
- If a web task can be solved with `web_fetch`, prefer that over browser automation.

## Expected Repo Files

Expect this workspace to contain:

- `config/openclaw.json5` for the redacted runtime config
- `scripts/windows/install-wsl.ps1` for the admin-only bootstrap
- `scripts/wsl/install-openclaw.sh` for package installation inside Ubuntu
- `scripts/wsl/write-secrets.sh` for private env and token-file creation
- `scripts/wsl/start-openclaw.sh` for consistent command execution
- `scripts/wsl/finalize-telegram-owner.sh` for owner locking and exec approvals

If those files drift from each other, update them together instead of patching only one side of the workflow.
