# AGENTS.md

Rules for cloud agents working in this repository.

## Scope

A pull request has one lane. `bun tools/gate/cli.ts` is the check. It exits 1 when a diff mixes lanes.

- `app`: every path is under `apps/<slug>/` for one slug. That slug is already `approved` on the merge-base ledger. Do not edit `tracking/` in an app pull request.
- `scout`: every path is under `tracking/`. An approval is terminal. The ledger command writes bookmark files. The gate exits 1 while `tracking/seen-bookmarks.json` is still in the tree.
- `repo`: every path is under `.github/`, `tools/gate/`, or `skills/`, or the path is `AGENTS.md`, `README.md`, or `LICENSE`.
- Never create a new repository. Work only in this one.
- Open exactly one PR per task.

## App rules

- Each app is self-contained and runs with Bun: `bun install && bun run dev`.
- Start from an official scaffold (`bunx create-*`, for example `bunx create-vite`). Do not hand-roll boilerplate.
- After the scaffold, run `bun tools/gate/cli.ts stamp apps/<slug>`.
- Before installing anything, create `apps/<slug>/bunfig.toml`:

  ```toml
  [install]
  minimumReleaseAge = 259200
  ```

- UI is shadcn/ui with the `base-lyra` style. `components.json` has `"style": "base-lyra"`.
- Keep it boring and small. One framework, prebuilt components over bespoke ones, and a few small tests and hooks.

## Process

1. Plan first. Read `skills/project-planning/SKILL.md` and write `apps/<slug>/PLAN.md`.
2. Build the MVP as vertical slices.
3. Run the app and verify it works.
4. Open one PR. Attach at least one screenshot and one video of the running app. A PR without both is incomplete.
