import { spawnSync } from "node:child_process"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { expect, test } from "bun:test"
import { isSlug } from "./classify.ts"
import { resolveMergeBase } from "./diff.ts"
import { approvedSlugsFromLedger, loadApprovedSlugs } from "./ledger.ts"

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))

test("the monolith reader returns approved slugs", () => {
  const read = approvedSlugsFromLedger({
    monolith: {
      proposed: [],
      approved: [{ slug: "deeptutor-demo" }, { slug: "geoinflow-demo" }],
      skipped: [],
    },
    bookmarks: undefined,
  })
  expect(slugs(read)).toEqual(["deeptutor-demo", "geoinflow-demo"])
})

test("a proposed or skipped bookmark does not approve a slug", () => {
  const read = approvedSlugsFromLedger({
    monolith: undefined,
    bookmarks: [
      { status: { phase: "proposed", at: "2026-11-03" } },
      { status: { phase: "skipped", at: "2026-11-03", reason: "duplicate" } },
    ],
  })
  expect(slugs(read)).toEqual([])
})

test("an approved bookmark record contributes its slug", () => {
  const read = approvedSlugsFromLedger({
    monolith: undefined,
    bookmarks: [{ status: { phase: "approved", at: "2026-11-03", slug: "deeptutor-demo" } }],
  })
  expect(slugs(read)).toEqual(["deeptutor-demo"])
})

test("an unknown phase fails the read", () => {
  const read = approvedSlugsFromLedger({
    monolith: undefined,
    bookmarks: [{ status: { phase: "archived" } }],
  })
  expect(read.ok).toBe(false)
})

test("a slug that does not match the app pattern fails the read", () => {
  const read = approvedSlugsFromLedger({
    monolith: { approved: [{ slug: "deeptutor" }] },
    bookmarks: undefined,
  })
  expect(read.ok).toBe(false)
})

test("both bookmark formats together fail the read", () => {
  const read = approvedSlugsFromLedger({
    monolith: { approved: [{ slug: "deeptutor-demo" }] },
    bookmarks: [{ status: { phase: "approved", at: "2026-11-03", slug: "deeptutor-demo" } }],
  })
  expect(read.ok).toBe(false)
  if (read.ok) return
  expect(read.reason).toContain("tracking/seen-bookmarks.json")
  expect(read.reason).toContain("tracking/bookmarks")
})

test("approval is read from the base commit, not the worktree", () => {
  const dir = mkdtempSync(join(tmpdir(), "gate-ledger-"))
  try {
    mkdirSync(join(dir, "tracking"), { recursive: true })
    writeFileSync(
      join(dir, "tracking", "seen-bookmarks.json"),
      `${JSON.stringify({ approved: [{ slug: "deeptutor-demo" }] })}\n`,
    )
    git(dir, ["init"])
    git(dir, ["add", "tracking/seen-bookmarks.json"])
    git(dir, [
      "-c",
      "user.email=gate@example.com",
      "-c",
      "user.name=gate",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-m",
      "ledger",
    ])
    const base = git(dir, ["rev-parse", "HEAD"])
    writeFileSync(join(dir, "tracking", "seen-bookmarks.json"), `${JSON.stringify({ approved: [] })}\n`)
    const read = loadApprovedSlugs(dir, base)
    expect(slugs(read)).toEqual(["deeptutor-demo"])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("the merge base approves the current demo slugs", () => {
  const base = resolveMergeBase(repoRoot)
  const read = loadApprovedSlugs(repoRoot, base)
  expect(read.ok).toBe(true)
  if (!read.ok) return
  const deeptutor = "deeptutor-demo"
  const geoinflow = "geoinflow-demo"
  if (!isSlug(deeptutor) || !isSlug(geoinflow)) {
    throw new Error("fixture slug does not match the slug pattern")
  }
  expect(read.slugs.has(deeptutor)).toBe(true)
  expect(read.slugs.has(geoinflow)).toBe(true)
})

function slugs(read: ReturnType<typeof approvedSlugsFromLedger>): string[] {
  expect(read.ok).toBe(true)
  if (!read.ok) return []
  return [...read.slugs].sort()
}

function git(cwd: string, args: readonly string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" })
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `git ${args.join(" ")} failed`)
  }
  return result.stdout.trim()
}
