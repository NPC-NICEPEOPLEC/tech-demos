# GEOInflow demo — plan

## Goal
One-sentence: let a single user paste sample access logs and see which AI crawlers hit which paths (and which key pages got zero crawls).

## Single-user MVP
- In: Bun app under `apps/geoinflow-demo/`; paste or upload a small access-log sample; classify common AI crawler user agents (GPTBot, ClaudeBot, PerplexityBot, Bytespider, and others). Google-Extended and Applebot-Extended are directive tokens and add no hit. Table and a simple chart of bot to path. Highlight configured key pages with zero crawls. Seed a sample log so the UI works with one click.
- Out: full GEOInflow Docker stack, real log shipping, auth, multi-tenant, production analytics, GEO referral attribution beyond UA classify, Cloudflare/hosting wiring beyond local `bun run dev`.

## Outcome-oriented tasks
1. Scaffold with official `bunx create-*` (Vite + React + TS preferred for a one-screen dashboard), add root `bunfig.toml` with `[install] minimumReleaseAge = 259200`, then `bun install`.
2. Init shadcn/ui minimalist preset; add only the components the screen needs (textarea/input, button, table, card, badge).
3. Parse nginx/combined-style log lines client-side; match AI bot UA dictionary; aggregate counts by bot and path.
4. UI: paste box + sample-load button → results table (bot, path, hits) + “zero-crawl key pages” list (defaults: `/`, `/pricing`, `/docs` editable lightly).
5. README with `bun install && bun run dev`; screenshot + short video of the happy path for the PR.

## Stack
- Bun — runtime, package manager, scripts (monorepo default).
- Vite + React + TypeScript — small single-screen app; skip Next/TanStack Start wiring.
- shadcn/ui — minimalist UI, components on demand.
- Recharts or lightweight CSS bars — only if a tiny chart helps; otherwise table-first.

## Deferred
- Streaming/live log tails, Docker Compose of upstream GEOInflow, account/login, deploy pipeline, multi-format log parsers beyond common combined/nginx.

## Done when
`cd apps/geoinflow-demo && bun install && bun run dev` shows the dashboard; loading the sample log classifies bots; PR includes ≥1 screenshot and ≥1 video of the running app.
