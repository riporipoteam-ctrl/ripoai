# AskAI Integrations Worker

A Cloudflare Worker that gives AskAI a real backend for:

1. **OAuth connect/disconnect** for GitHub, Slack, Google (Gmail + Calendar), Notion and Linear.
2. **Cron jobs** — runs due scheduled jobs every 15 minutes.
3. **`/browse/render`** — real headless screenshots for the agent browser ("OpenClaw") preview, with a URL/HTML-snapshot fallback.

> **This is a ONE-TIME OWNER SETUP.** Once the app owner deploys this Worker and sets the provider secrets, **end users connect their own accounts with zero keys** — the OAuth `client_id`/`client_secret` live in this Worker (server-side), never in the browser. **OAuth tokens are stored in KV and are never returned to the client.**

---

## Endpoints

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET  | `/oauth/{provider}/start?uid=&redirect=` | Returns `{ url }` — the provider authorize URL (signed state). |
| GET  | `/oauth/{provider}/callback?code=&state=` | Exchanges code for tokens, stores in KV, redirects to `redirect?connected={provider}`. |
| GET  | `/integrations/status?uid=` | Returns `{ connected: {...}, configured: {...} }`. No tokens. |
| POST | `/integrations/{provider}/disconnect` | Body `{ uid }`. Deletes the stored token. |
| POST | `/jobs/sync` | Body `{ uid, jobs:[...] }`. Client pushes due jobs into KV. |
| POST | `/browse/render` | Body `{ url, fullPage?, width?, height? }`. Returns `{ ok, image }` or `{ ok:false, url, title, snapshot }`. |
| GET  | `/health` | Liveness + provider list. |

`provider` is one of: `github`, `slack`, `google`, `notion`, `linear`.

---

## One-time deploy

```bash
cd worker
npm i -g wrangler           # if not installed
wrangler login

# 1) Create the KV namespace, then paste the printed id into wrangler.toml
#    ([[kv_namespaces]] id = "...").
wrangler kv namespace create INTEGRATIONS

# 2) Edit wrangler.toml:
#    - set APP_ORIGIN to your app origin(s) (comma-separated; first is canonical)
#    - set WORKER_PUBLIC_URL to the Worker's public URL (fill after first deploy)

# 3) Set the signing secret (any long random string):
wrangler secret put STATE_SIGNING_SECRET

# 4) Set each provider's OAuth credentials (see below), then:
wrangler deploy
```

After the first `wrangler deploy`, note the printed URL
(`https://askai-integrations-worker.<account>.workers.dev`), set it as
`WORKER_PUBLIC_URL` in `wrangler.toml`, and `wrangler deploy` again so the OAuth
`redirect_uri` is exact. Then point the app at the Worker:

```
VITE_INTEGRATIONS_WORKER_URL=https://askai-integrations-worker.<account>.workers.dev
```

---

## Provider secrets (run ONCE, owner only)

Each provider needs a `*_CLIENT_ID` and `*_CLIENT_SECRET`. Register an OAuth app in
each provider's console with the **exact callback URL** below (replace `<WORKER>`
with your `WORKER_PUBLIC_URL`).

### GitHub — https://github.com/settings/developers (New OAuth App)
- Authorization callback URL: `<WORKER>/oauth/github/callback`
```bash
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
```

### Slack — https://api.slack.com/apps (Create New App → OAuth & Permissions)
- Redirect URL: `<WORKER>/oauth/slack/callback`
- Bot scopes: `chat:write`, `channels:read`, `channels:history`
```bash
wrangler secret put SLACK_CLIENT_ID
wrangler secret put SLACK_CLIENT_SECRET
```

### Google (Gmail + Calendar) — https://console.cloud.google.com/apis/credentials
- OAuth client type: Web application
- Authorized redirect URI: `<WORKER>/oauth/google/callback`
- Enable the **Gmail API** and **Google Calendar API**; add the Gmail/Calendar scopes to the consent screen.
```bash
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
```

### Notion — https://www.notion.so/my-integrations (Public integration)
- Redirect URI: `<WORKER>/oauth/notion/callback`
```bash
wrangler secret put NOTION_CLIENT_ID
wrangler secret put NOTION_CLIENT_SECRET
```

### Linear — https://linear.app/settings/api/applications (Create new application)
- Callback URL: `<WORKER>/oauth/linear/callback`
```bash
wrangler secret put LINEAR_CLIENT_ID
wrangler secret put LINEAR_CLIENT_SECRET
```

---

## Optional secrets

### Real browser screenshots (`/browse/render`)
Without these, `/browse/render` returns a URL + HTML-text snapshot fallback (no
black box). With them it returns a real PNG via Cloudflare Browser Rendering.
```bash
wrangler secret put CF_ACCOUNT_ID      # your Cloudflare account id
wrangler secret put CF_BROWSER_TOKEN   # API token with Browser Rendering:Edit
```

### Job runner webhook (cron)
The 15-minute cron advances each job's schedule and records a run. To actually
execute job work, point it at a webhook you control:
```bash
wrangler secret put JOB_RUNNER_URL     # POSTed { uid, job } per due job
wrangler secret put JOB_RUNNER_TOKEN   # optional bearer token for the webhook
```

---

## Notes
- Tokens live in KV under `tok:{uid}:{provider}`; jobs under `job:{uid}:{id}`. The
  client only ever sees connection metadata (connectedAt, scope), never tokens.
- OAuth `state` is HMAC-signed (`STATE_SIGNING_SECRET`) and valid for 15 minutes.
- CORS is restricted to `APP_ORIGIN`.
