---
name: project-planning
description: MVP-first planning for a small Bun + shadcn/ui demo app. Use before building any app in apps/<slug>/; produces apps/<slug>/PLAN.md.
---

# Project planning

Write `apps/<slug>/PLAN.md` before any code. Keep it to one page.

## PLAN.md sections
1. **Goal** – one sentence: what the demo shows and for whom.
2. **MVP (single user) + outs** – the smallest thing one person can click through. List explicit "outs": what is cut so this ships today.
3. **Tasks** – vertical slices. Each task delivers something runnable end to end (UI to data), not a layer.
4. **Stack** – each choice with a one-line rationale.
5. **Deferred** – things intentionally left for later.

## Rules
- Runtime and package manager: Bun (`bun install && bun run dev`).
- Scaffold with an official `bunx create-*`; never hand-roll boilerplate.
- Add `bunfig.toml` with `[install]` `minimumReleaseAge = 259200` before installing.
- UI: shadcn/ui, minimalist preset.
- Prebuilt over bespoke; boring defaults.
- One framework only.
- Add small tests/hooks, not a large suite.
