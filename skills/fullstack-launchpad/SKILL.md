---
name: fullstack-launchpad
description: Build ambitious websites, apps, dashboards, landing pages, and MVPs end-to-end. Use when the user wants a product planned, implemented, polished, packaged into a zip, or optionally prepared for hosting.
---

# Fullstack Launchpad

Ship products that feel intentional, polished, and ready to hand off.
Prefer finished artifacts over vague advice.

## Workflow

1. Turn the request into a concrete deliverable with clear pages, flows, and constraints.
2. Build the real app or site in the workspace instead of stopping at mockups.
3. Use bold, purposeful frontend design rather than generic app shells.
4. Run available build or test steps before handoff.
5. Package shippable artifacts into a zip when the user asks for a download or deliverable bundle.

## Packaging

- Put release-ready output under `releases/<project-name>/` when practical.
- Use `scripts/package-release.sh <source_dir> [output_zip]` to produce a zip artifact when packaging is requested.
- Include the built app, deploy config, and any small launch instructions that are necessary to run it.

## Hosting

- For static sites, prepare for Vercel or Netlify when the user wants free hosting.
- For apps that need a long-running backend, prefer Render, VPS, or another real server and explain free-tier sleep limits plainly.
- Do not promise a successful deploy unless the required account access, tokens, and hosting limits actually allow it.

## Quality Bar

- Finish the key user flow, not just the homepage.
- Keep layouts strong on desktop and mobile.
- Favor clear typography, visual hierarchy, and reusable components.
- If the app needs admin, dashboard, or multi-page structure, implement it rather than describing it.
