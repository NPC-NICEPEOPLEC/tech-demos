# AGENTS.md – rules for cloud agents

## Scope
- Only add or update files under `apps/<slug>/`. Do not touch other apps, root files, or `tracking/`.
- Never create a new repository. Work only in this one.
- Open exactly one PR per task.

## App rules
- Each app is self-contained and runs with Bun: `bun install && bun run dev`.
- Start from an official scaffold (`bunx create-*`, e.g. `bunx create-vite`, `bunx create-next-app`). Do not hand-roll boilerplate.
- Before installing anything, create `apps/<slug>/bunfig.toml`:
  ```toml
  [install]
  minimumReleaseAge = 259200
  ```
- UI: shadcn/ui, minimalist preset.
- Keep it boring and small: one framework, prebuilt components over bespoke ones, a few small tests/hooks.

## Process
1. Plan first: read `skills/project-planning/SKILL.md` and write `apps/<slug>/PLAN.md`.
2. Build the MVP as vertical slices.
3. Run the app and verify it works.
4. Open one PR. The PR MUST attach at least one screenshot AND at least one video of the running app. A PR without both is incomplete.
