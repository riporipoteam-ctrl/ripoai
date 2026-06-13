# AskAI Cloud Computer (Cloudflare Containers sandbox)

A real Linux sandbox for AI agents — run commands, install packages, read/write
files, and host apps with a live preview URL. Built on **Cloudflare Containers**
via the **Sandbox SDK** (`@cloudflare/sandbox`).

This is the genuine backend for the "agents share a cloud computer" feature.
Unlike OpenClaw (which runs client-side against free public readers and needs no
host), a cloud computer **executes code**, so it needs real compute.

## Requirements (this costs money — your account, your call)
- A Cloudflare account on the **Workers Paid** plan with **Containers enabled**.
- Usage is billed by Cloudflare per container runtime.

## Activate
1. Add these repo **secrets** (Settings → Secrets and variables → Actions):
   - `CLOUDFLARE_API_TOKEN` — a token with Workers + Containers deploy perms
   - `CLOUDFLARE_ACCOUNT_ID`
   - `SANDBOX_SECRET` — any long random string (the app sends it as a Bearer token)
2. Run the **"Deploy AskAI Cloud Computer"** workflow from the Actions tab.
3. It deploys `askai-sandbox` to `https://askai-sandbox.<your-subdomain>.workers.dev`.
4. Point the app at it (env `VITE_SANDBOX_URL` for web; a constant for iOS) and
   set the same `SANDBOX_SECRET`.

## API (all POST, `Authorization: Bearer <SANDBOX_SECRET>`)
| Endpoint | Body | Does |
|---|---|---|
| `/exec` | `{cmd}` | run a shell command → `{stdout,stderr,exitCode}` |
| `/write` | `{path,content}` | write a file |
| `/read` | `{path}` | read a file |
| `/ls` | `{path}` | list a directory |
| `/rm` | `{path}` | delete a file/folder |
| `/start` | `{cmd}` | start a long-running process (dev server) |
| `/expose` | `{port}` | expose a port → live preview `{url}` |
| `/usage` | – | disk usage (for the storage-cleanup UI) |
| `/reset` | – | wipe the workspace |

`?workspace=<id>` selects which shared machine (default `shared`). Gate
creation to AskAI+ in the app (free plans: no cloud computer).

> Note: container image versions/instance types evolve — if a deploy errors,
> bump `@cloudflare/sandbox` and the `cloudflare/sandbox` base image in the
> Dockerfile to the latest matching versions.
