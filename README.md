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

## Deploy to Netlify (recommended — shorter URL)

A `netlify.toml` is included, so deploying is one click:

1. Push this repo to GitHub (done).
2. On **netlify.com** → **Add new site → Import from GitHub** → pick this repo.
   Build command and publish dir are auto-detected from `netlify.toml`
   (`npm run build` → `dist`, with `VITE_BASE="/"` so it serves at the root).
3. **Site settings → Environment variables** → add `VITE_GROQ_API_KEY` and
   `VITE_OPENROUTER_API_KEY`. Then **Deploys → Trigger deploy**.
4. **Site settings → Domain management** → rename the site to e.g.
   **`ripoai`** → you get **`ripoai.netlify.app`** (short, custom). Add your own
   custom domain there too if you have one.
5. In **Firebase → Authentication → Authorized domains**, add your
   `*.netlify.app` domain (and any custom domain) so Google sign‑in works.

> Shorter GitHub Pages URL: GitHub can't shorten `…github.io/ripoai/` without a
> custom domain or renaming the repo to `riporipoteam-ctrl.github.io` (which
> serves at the root). Netlify's free custom subdomain is the easiest fix.

## Android APK (build on GitHub — no local Android SDK needed)

RipoAI ships as an Android app via **Capacitor**, built by GitHub Actions:

1. Make sure the repo secrets `VITE_GROQ_API_KEY` and `VITE_OPENROUTER_API_KEY`
   are set (Settings → Secrets and variables → Actions).
2. **Actions** tab → **Build Android APK** → **Run workflow**.
3. When it finishes (~5 min), download the APK from:
   - the run's **Artifacts** (`RipoAI-apk`), or
   - the **`android-latest` Release** (`RipoAI.apk`).
4. On your phone: open `RipoAI.apk`, allow **install from unknown sources**, install.

It's a **debug** APK (unsigned) — installable directly; for the Play Store you'd
produce a signed release build.

> ⚠️ Inside the Android WebView, **Google sign‑in (popup) does not work** — use
> **email/password** in the app. (Native Google auth would need the
> `@capacitor-firebase/authentication` plugin.) `localhost` must be in Firebase
> Authorized domains (it is by default).

## iOS app

iPhone/iPad get RipoAI two ways:

**1. Add to Home Screen (free, no Mac, recommended).** Open the deployed RipoAI
site in **Safari** → tap **Share** → **Add to Home Screen**. RipoAI installs with
its app icon and launches **full‑screen** (no Safari chrome), respecting the
notch and home indicator — it behaves like a native app. The app even shows a
one‑time hint explaining this. This is a real PWA install and needs no Apple
account.

**2. Native build via Capacitor (needs a Mac for device install).** GitHub
Actions builds the iOS app on a macOS runner:

1. **Actions** tab → **Build iOS app** → **Run workflow**.
2. Download from the run's **Artifacts** (or the **`ios-latest` Release**):
   - `RipoAI-iOS-Simulator.zip` — runs in Xcode's iOS Simulator on a Mac.
   - `RipoAI-iOS-Xcode-project.zip` — open `App/App.xcodeworkspace` in Xcode,
     set your **Signing Team**, plug in your iPhone, press **Run** to install.

> ⚠️ Apple does **not** allow installing **unsigned** apps on a physical device.
> Running on a real iPhone requires an **Apple Developer account** ($99/yr) and
> code signing — that's an Apple rule, not a RipoAI limitation. The PWA path
> above sidesteps all of it. Inside the iOS WebView, Google sign‑in (popup) may
> not work — use **email/password**.

## Google sign‑in in an installed (home‑screen) PWA

Google sign‑in works in a normal browser tab, but in an **installed PWA**
(Add to Home Screen) it fails on GitHub Pages / Netlify. That's not a bug in
the code — it's a browser rule: the Firebase OAuth handler lives on a
*different* domain (`…firebaseapp.com`) than your app (`…github.io`), and
installed PWAs **partition storage per‑domain**, so the credential returned by
Google can never be read back by the app. iOS is strictest about this.

**The fix is to serve the app from a domain where the auth handler is
same‑origin — Firebase Hosting (`https://ripoai-dff5d.web.app`).** There the
handler is part of the same site, so Google sign‑in works everywhere, PWA
included. A deploy workflow is provided:

1. **Firebase console → Hosting → Get started** (enable Hosting).
2. Create a **service‑account key** (role: *Firebase Hosting Admin*) and add it
   as the repo secret **`FIREBASE_SERVICE_ACCOUNT`** (paste the full JSON).
   Tip: `firebase init hosting:github` wires this up automatically.
3. Push to the deploy branch (or run **Actions → Deploy to Firebase Hosting**).
4. Open **`https://ripoai-dff5d.web.app`** in Safari/Chrome → **Add to Home
   Screen**. Google sign‑in now works in the installed app.

The app's `authDomain` is already set to `ripoai-dff5d.web.app` for this. On
GitHub Pages the code still does the right thing (redirect‑based sign‑in), but
the **`.web.app` install is the reliable one for Google in a PWA**. Email/
password works everywhere regardless. In the **native APK/iOS app**, use
email/password (native Google would need the Capacitor Firebase Auth plugin).

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
