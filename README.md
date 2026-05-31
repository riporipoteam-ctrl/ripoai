# RipoAI

A polished, ChatGPT‑style AI web app — chat, live web research, memory, and an in‑browser
coding workspace with live preview. Built with React + Vite + TypeScript, Firebase Auth +
Firestore, Tailwind, Framer Motion and an iOS‑26 "Liquid Glass" design. Deploys to GitHub Pages.

## Features

- **Auth** — email/password + Google sign‑in (Firebase). Animated onboarding on first run.
- **Chat** — streaming answers, Markdown + syntax‑highlighted code, math, copy, edit, regenerate,
  stop. Reasoning shown as a collapsible panel.
- **Models** — pick a RipoAI tier per chat:
  | Tier | Powered by (Groq) |
  | --- | --- |
  | RipoAI 1o instant | `qwen/qwen3-32b` |
  | RipoAI 2o instant | `meta-llama/llama-4-scout-17b-16e-instruct` (vision) |
  | RipoAI 1o Pro | `llama-3.3-70b-versatile` |
  | RipoAI 2o Pro (flagship) | `openai/gpt-oss-120b` |
- **Web Search mode** — live, cited answers via Groq's `compound` model. When off, RipoAI
  auto‑decides whether a query needs the web.
- **Agent mode** — autonomous, multi‑step web research with a visible step trace.
- **Uploads** — images (sent to vision models) and files/PDFs (parsed client‑side as context).
- **Projects** — a coding agent + a real in‑browser sandbox (Sandpack) with **Code / Preview /
  Console** tabs. The agent writes files that run instantly.
- **Memory** — RipoAI extracts durable facts about you and reuses them; manage them in Settings.
- **Settings** — theme (light/dark/system), accent, liquid‑glass intensity, default model,
  custom instructions, memory, and data controls.
- **History** — chats saved to Firestore, grouped by date, searchable, renamable.

## Run locally

```bash
npm install
echo "VITE_GROQ_API_KEY=your_groq_key_here" > .env   # .env is gitignored
npm run dev
```

Open the printed URL. Google sign‑in works on `localhost` out of the box.

## The Groq API key

GitHub push protection refuses to let an API key be committed to source, so the key is
**not** hardcoded. It is resolved at runtime from, in order:

1. a key you paste into **Settings → General → Groq API key** (saved only in your browser), or
2. the build‑time env var `VITE_GROQ_API_KEY` (a local `.env` for dev; a GitHub Actions secret
   for the deployed site).

To make the deployed site work for everyone without anyone entering a key, add the secret:
**GitHub → Settings → Secrets and variables → Actions → New repository secret**, name
`VITE_GROQ_API_KEY`. The deploy workflow injects it at build time (the key then lives in the
public bundle — the trade‑off accepted for a keyless‑for‑users static site).

## One‑time setup (required for production)

1. **Firebase → Authentication → Sign‑in method**: enable **Email/Password** and **Google**.
2. **Firebase → Authentication → Settings → Authorized domains**: add
   `riporipoteam-ctrl.github.io`.
3. **Firebase → Firestore Database**: create a database, then publish the rules from
   [`firestore.rules`](./firestore.rules).
4. **GitHub → Settings → Pages → Build and deployment → Source**: select **GitHub Actions**.
   Pushing to the deploy branch then publishes to `https://riporipoteam-ctrl.github.io/ripoai/`.
5. **GitHub → Settings → Secrets and variables → Actions**: add `VITE_GROQ_API_KEY` (see above).

## Notes on scope

This is a **static** app (GitHub Pages). Features that require an always‑on server are
intentionally **not** included rather than faked: a real OS browser agent that drives Chrome,
arbitrary terminal/command execution, native APK builds, and a persistent Expo preview. The
Projects sandbox is the genuine in‑browser equivalent for "live code + preview".

> ⚠️ With a site‑wide key (option 2 above) the key ships in the public client bundle and is
> abusable. Rotate it in the Groq console if you see abuse. For zero exposure, leave the secret
> unset and have each user paste their own key in Settings.

## Tech

React 18 · Vite 6 · TypeScript · Tailwind CSS · Framer Motion · Zustand · Firebase ·
`@codesandbox/sandpack-react` · react‑markdown · KaTeX · Groq API.
