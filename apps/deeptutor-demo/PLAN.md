# DeepTutor demo — plan

## Goal
Let one user paste study notes and get a short quiz plus explanations grounded in those notes, with progress remembered locally — a lightweight taste of DeepTutor (HKUDS).

## Single-user MVP
- In: paste notes (or load a sample passage) → generate 3–5 quiz questions with answers/explanations tied to the text → answer them and see feedback → progress (seen topics, scores, weak spots) saved in localStorage as a simple "three-layer memory" sketch (session / topic / long-term summary).
- Generation: deterministic local heuristics (key-sentence extraction, cloze questions) by default so it runs with zero keys; optional LLM mode only if an env key is present (not required for the demo or the video).
- Out: full DeepTutor repo, RAG over PDFs, multi-user accounts, visual diagram generation, backend database, deployment.

## Tasks (vertical slices)
1. Scaffold via official `bunx create-vite` (React + TS); root `bunfig.toml` with `[install] minimumReleaseAge = 259200`, then `bun install`.
2. shadcn/ui minimalist preset; add only textarea, button, card, badge, progress, tabs as needed.
3. Notes → quiz generator (pure functions, unit-tested).
4. Quiz UI with answer checking and explanation reveal.
5. Memory panel: localStorage progress, reset button.
6. README with `bun install && bun run dev`; PR with ≥1 screenshot and ≥1 video of the happy path using the sample notes.

## Stack
- Bun — runtime/package manager per monorepo rules.
- Vite + React + TS — one-screen tool, no framework wiring needed.
- shadcn/ui — minimal components on demand.
- localStorage — enough persistence for single-user progress.

## Deferred
PDF/textbook upload, real RAG, LLM-generated diagrams, spaced-repetition scheduling, sync across devices.

## Done when
`cd apps/deeptutor-demo && bun install && bun run dev` → load sample notes → quiz generated → answering updates progress that survives reload; PR has ≥1 screenshot and ≥1 video.
