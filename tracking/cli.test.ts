import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { expect, test } from "bun:test"

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = dirname(here)
const cli = join(here, "cli.ts")

const GEO_ID = "2114576054018818536"
const DEEP_ID = "2114702883673501719"
const GEO_TITLE = "GEOInflow — self-hosted GEO / AI crawler analytics"
const DEEP_TITLE = "DeepTutor — HKUDS lifelong personalized AI tutor"
const GEO_URL = "https://x.com/yaojingang/status/2114576054018818536"
const DEEP_URL = "https://x.com/chasen_liao/status/2114702883673501719"
const GEO_DATE = "2026-11-02T04:21:50.000Z"
const DEEP_DATE = "2026-11-03"
const GEO_AT = "2026-11-02T04:22:00.000Z"
const DEEP_AT = "2026-11-03T08:32:00.000Z"

type RunResult = { readonly code: number; readonly stdout: string; readonly stderr: string }

test("propose keeps the source date and writes one canonical file", () => {
  const dir = initRepo()
  try {
    const before = Date.now()
    const result = run(dir, ["propose", "--id", "1", "--title", 'Say "hi"', "--url", "https://x.com/a/status/1", "--date", DEEP_DATE])
    const after = Date.now()
    expect(result.code).toBe(0)
    expect(result.stdout).toBe("")
    expect(result.stderr).toBe("")
    const bytes = readBookmark(dir, "1")
    const at = statusAt(bytes)
    expect(Date.parse(at)).toBeGreaterThanOrEqual(before - 1000)
    expect(Date.parse(at)).toBeLessThanOrEqual(after + 1000)
    expect(bytes).toBe(proposedBytes("1", 'Say "hi"', "https://x.com/a/status/1", DEEP_DATE, at))
    expect(bytes).not.toContain("T00:00:00")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("propose with the same title, url, and date writes nothing", () => {
  const dir = initRepo()
  try {
    expect(run(dir, proposeArgs("1", "T", "https://x.com/a/status/1", DEEP_DATE)).code).toBe(0)
    const before = snapshot(dir, "1")
    const result = run(dir, proposeArgs("1", "T", "https://x.com/a/status/1", DEEP_DATE))
    expect(result.code).toBe(0)
    expect(result.stderr).toBe("")
    expect(snapshot(dir, "1")).toEqual(before)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("propose with a different title, url, or date writes nothing", () => {
  const dir = initRepo()
  try {
    expect(run(dir, proposeArgs("1", "T", "https://x.com/a/status/1", DEEP_DATE)).code).toBe(0)
    const before = snapshot(dir, "1")
    for (const args of [
      proposeArgs("1", "Other", "https://x.com/a/status/1", DEEP_DATE),
      proposeArgs("1", "T", "https://x.com/a/status/2", DEEP_DATE),
      proposeArgs("1", "T", "https://x.com/a/status/1", "2026-11-03T00:00:00.000Z"),
    ]) {
      const result = run(dir, args)
      expect(result.code).toBe(1)
      expect(result.stdout).toBe("")
      expect(snapshot(dir, "1")).toEqual(before)
    }
    expect(readBookmark(dir, "1")).toContain(`"date": "${DEEP_DATE}"`)
    expect(readBookmark(dir, "1")).not.toContain("2026-11-03T00:00:00.000Z")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("approve requires a proposed bookmark and a free slug", () => {
  const dir = initRepo()
  try {
    expect(run(dir, ["approve", "--id", "9", "--slug", "geoinflow-demo"]).code).toBe(1)
    expect(existsSync(bookmarkPath(dir, "9"))).toBe(false)

    expect(run(dir, proposeArgs("1", "T", "https://x.com/a/status/1", DEEP_DATE)).code).toBe(0)
    expect(run(dir, proposeArgs("2", "U", "https://x.com/b/status/2", GEO_DATE)).code).toBe(0)
    const before = Date.now()
    const approved = run(dir, ["approve", "--id", "1", "--slug", "geoinflow-demo"])
    const after = Date.now()
    expect(approved.code).toBe(0)
    const bytes = readBookmark(dir, "1")
    const at = statusAt(bytes)
    expect(Date.parse(at)).toBeGreaterThanOrEqual(before - 1000)
    expect(Date.parse(at)).toBeLessThanOrEqual(after + 1000)
    expect(bytes).toBe(approvedBytes("1", "T", "https://x.com/a/status/1", DEEP_DATE, at, "geoinflow-demo"))

    const again = snapshot(dir, "1")
    expect(run(dir, ["approve", "--id", "1", "--slug", "geoinflow-demo"]).code).toBe(0)
    expect(snapshot(dir, "1")).toEqual(again)

    const secondSlug = run(dir, ["approve", "--id", "1", "--slug", "deeptutor-demo"])
    expect(secondSlug.code).toBe(1)
    expect(snapshot(dir, "1")).toEqual(again)

    const taken = snapshot(dir, "2")
    expect(run(dir, ["approve", "--id", "2", "--slug", "geoinflow-demo"]).code).toBe(1)
    expect(snapshot(dir, "2")).toEqual(taken)
    expect(run(dir, ["approve", "--id", "2", "--slug", "nope"]).code).toBe(1)
    expect(snapshot(dir, "2")).toEqual(taken)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("skip requires a proposed bookmark, and the same reason again writes nothing", () => {
  const dir = initRepo()
  try {
    expect(run(dir, ["skip", "--id", "9", "--reason", "duplicate"]).code).toBe(1)
    expect(existsSync(bookmarkPath(dir, "9"))).toBe(false)
    expect(run(dir, proposeArgs("1", "T", "https://x.com/a/status/1", DEEP_DATE)).code).toBe(0)
    expect(run(dir, proposeArgs("2", "U", "https://x.com/b/status/2", GEO_DATE)).code).toBe(0)
    const skipped = run(dir, ["skip", "--id", "1", "--reason", "duplicate"])
    expect(skipped.code).toBe(0)
    const bytes = readBookmark(dir, "1")
    const at = statusAt(bytes)
    expect(bytes).toBe(skippedBytes("1", "T", "https://x.com/a/status/1", DEEP_DATE, at, "duplicate"))

    const again = snapshot(dir, "1")
    expect(run(dir, ["skip", "--id", "1", "--reason", "duplicate"]).code).toBe(0)
    expect(snapshot(dir, "1")).toEqual(again)
    expect(run(dir, ["skip", "--id", "1", "--reason", "other"]).code).toBe(1)
    expect(snapshot(dir, "1")).toEqual(again)
    expect(run(dir, ["approve", "--id", "1", "--slug", "geoinflow-demo"]).code).toBe(1)
    expect(snapshot(dir, "1")).toEqual(again)

    expect(run(dir, ["approve", "--id", "2", "--slug", "deeptutor-demo"]).code).toBe(0)
    const approved = snapshot(dir, "2")
    expect(run(dir, ["skip", "--id", "2", "--reason", "duplicate"]).code).toBe(1)
    expect(snapshot(dir, "2")).toEqual(approved)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("a repeated propose does not change an approved or skipped bookmark", () => {
  const dir = initRepo()
  try {
    expect(run(dir, proposeArgs("1", "T", "https://x.com/a/status/1", DEEP_DATE)).code).toBe(0)
    expect(run(dir, ["approve", "--id", "1", "--slug", "geoinflow-demo"]).code).toBe(0)
    const approved = snapshot(dir, "1")
    expect(run(dir, proposeArgs("1", "T", "https://x.com/a/status/1", DEEP_DATE)).code).toBe(0)
    expect(run(dir, proposeArgs("1", "Other", "https://x.com/a/status/1", DEEP_DATE)).code).toBe(1)
    expect(snapshot(dir, "1")).toEqual(approved)

    expect(run(dir, proposeArgs("2", "U", "https://x.com/b/status/2", GEO_DATE)).code).toBe(0)
    expect(run(dir, ["skip", "--id", "2", "--reason", "duplicate"]).code).toBe(0)
    const skipped = snapshot(dir, "2")
    expect(run(dir, proposeArgs("2", "U", "https://x.com/b/status/2", GEO_DATE)).code).toBe(0)
    expect(snapshot(dir, "2")).toEqual(skipped)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("the monolith blocks a new bookmark file", () => {
  const dir = initRepo()
  try {
    writeFileSync(join(dir, "tracking", "seen-bookmarks.json"), "{}\n")
    const result = run(dir, proposeArgs("1", "T", "https://x.com/a/status/1", DEEP_DATE))
    expect(result.code).toBe(1)
    expect(existsSync(bookmarkPath(dir, "1"))).toBe(false)
    expect(readFileSync(join(dir, "tracking", "seen-bookmarks.json"), "utf8")).toBe("{}\n")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("check accepts a status change and rejects an identity change", () => {
  const dir = initRepo()
  try {
    expect(run(dir, proposeArgs("1", "T", "https://x.com/a/status/1", DEEP_DATE)).code).toBe(0)
    expect(run(dir, proposeArgs("2", "U", "https://x.com/b/status/2", GEO_DATE)).code).toBe(0)
    const base = commitAll(dir)
    expect(run(dir, ["approve", "--id", "1", "--slug", "geoinflow-demo"]).code).toBe(0)
    expect(run(dir, ["check"], { GATE_BASE: base }).code).toBe(0)

    const fresh = run(dir, proposeArgs("3", "V", "https://x.com/c/status/3", DEEP_DATE))
    expect(fresh.code).toBe(0)
    expect(run(dir, ["check"], { GATE_BASE: base }).code).toBe(0)

    rmSync(bookmarkPath(dir, "3"))
    const current = readBookmark(dir, "2")
    const changed = current.replace(`"title": "U"`, `"title": "Changed"`)
    writeFileSync(bookmarkPath(dir, "2"), changed)
    const stamped = snapshot(dir, "2")
    const identity = run(dir, ["check"], { GATE_BASE: base })
    expect(identity.code).toBe(1)
    expect(identity.stderr).toContain("title")
    expect(snapshot(dir, "2")).toEqual(stamped)

    writeFileSync(bookmarkPath(dir, "2"), changed.replace(`{\n  "id"`, `{\n "id"`))
    expect(run(dir, ["check"], { GATE_BASE: base }).code).toBe(1)
    expect(run(dir, ["check"], { GATE_BASE: base }).stderr).toContain("canonical")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("check rejects a rewrite of an approved bookmark", () => {
  const dir = initRepo()
  try {
    expect(run(dir, proposeArgs("1", "T", "https://x.com/a/status/1", DEEP_DATE)).code).toBe(0)
    expect(run(dir, ["approve", "--id", "1", "--slug", "geoinflow-demo"]).code).toBe(0)
    const base = commitAll(dir)
    const at = statusAt(readBookmark(dir, "1"))
    const rewrites = [
      proposedBytes("1", "T", "https://x.com/a/status/1", DEEP_DATE, at),
      skippedBytes("1", "T", "https://x.com/a/status/1", DEEP_DATE, at, "duplicate"),
      approvedBytes("1", "T", "https://x.com/a/status/1", DEEP_DATE, at, "deeptutor-demo"),
    ]
    for (const bytes of rewrites) {
      writeFileSync(bookmarkPath(dir, "1"), bytes)
      const stamped = snapshot(dir, "1")
      const result = run(dir, ["check"], { GATE_BASE: base })
      expect(result.code).toBe(1)
      expect(result.stderr).toContain("approval")
      expect(snapshot(dir, "1")).toEqual(stamped)
    }
    writeFileSync(
      bookmarkPath(dir, "1"),
      approvedBytes("1", "T", "https://x.com/a/status/1", DEEP_DATE, "2026-11-04T00:00:00.000Z", "geoinflow-demo"),
    )
    expect(run(dir, ["check"], { GATE_BASE: base }).code).toBe(0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("check rejects demoting an approval recorded in the monolith", () => {
  const dir = initRepo()
  try {
    writeFileSync(join(dir, "tracking", "seen-bookmarks.json"), monolith("1", "T", "https://x.com/a/status/1", DEEP_DATE))
    const base = commitAll(dir)
    rmSync(join(dir, "tracking", "seen-bookmarks.json"))
    expect(run(dir, proposeArgs("1", "T", "https://x.com/a/status/1", DEEP_DATE)).code).toBe(0)
    const result = run(dir, ["check"], { GATE_BASE: base })
    expect(result.code).toBe(1)
    expect(result.stderr).toContain("approval")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("check rejects rewriting a skipped bookmark as proposed", () => {
  const dir = initRepo()
  try {
    expect(run(dir, proposeArgs("1", "T", "https://x.com/a/status/1", DEEP_DATE)).code).toBe(0)
    expect(run(dir, ["skip", "--id", "1", "--reason", "duplicate"]).code).toBe(0)
    const base = commitAll(dir)
    const at = statusAt(readBookmark(dir, "1"))
    writeFileSync(bookmarkPath(dir, "1"), proposedBytes("1", "T", "https://x.com/a/status/1", DEEP_DATE, at))
    const stamped = snapshot(dir, "1")
    const result = run(dir, ["check"], { GATE_BASE: base })
    expect(result.code).toBe(1)
    expect(result.stderr).toContain("skip")
    expect(snapshot(dir, "1")).toEqual(stamped)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("check rejects rewriting a skipped bookmark as approved", () => {
  const dir = initRepo()
  try {
    expect(run(dir, proposeArgs("1", "T", "https://x.com/a/status/1", DEEP_DATE)).code).toBe(0)
    expect(run(dir, ["skip", "--id", "1", "--reason", "duplicate"]).code).toBe(0)
    const base = commitAll(dir)
    const at = statusAt(readBookmark(dir, "1"))
    writeFileSync(
      bookmarkPath(dir, "1"),
      approvedBytes("1", "T", "https://x.com/a/status/1", DEEP_DATE, at, "fresh-demo"),
    )
    const stamped = snapshot(dir, "1")
    const result = run(dir, ["check"], { GATE_BASE: base })
    expect(result.code).toBe(1)
    expect(result.stderr).toContain("skip")
    expect(snapshot(dir, "1")).toEqual(stamped)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("check rejects a skipped reason change", () => {
  const dir = initRepo()
  try {
    expect(run(dir, proposeArgs("1", "T", "https://x.com/a/status/1", DEEP_DATE)).code).toBe(0)
    expect(run(dir, ["skip", "--id", "1", "--reason", "duplicate"]).code).toBe(0)
    const base = commitAll(dir)
    const at = statusAt(readBookmark(dir, "1"))
    writeFileSync(bookmarkPath(dir, "1"), skippedBytes("1", "T", "https://x.com/a/status/1", DEEP_DATE, at, "other"))
    const stamped = snapshot(dir, "1")
    const result = run(dir, ["check"], { GATE_BASE: base })
    expect(result.code).toBe(1)
    expect(result.stderr).toContain("skip")
    expect(snapshot(dir, "1")).toEqual(stamped)
    writeFileSync(
      bookmarkPath(dir, "1"),
      skippedBytes("1", "T", "https://x.com/a/status/1", DEEP_DATE, "2026-11-04T00:00:00.000Z", "duplicate"),
    )
    expect(run(dir, ["check"], { GATE_BASE: base }).code).toBe(0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("check rejects promoting a skip recorded in the monolith", () => {
  const dir = initRepo()
  try {
    writeFileSync(
      join(dir, "tracking", "seen-bookmarks.json"),
      skippedMonolith("1", "T", "https://x.com/a/status/1", DEEP_DATE, "duplicate"),
    )
    const base = commitAll(dir)
    rmSync(join(dir, "tracking", "seen-bookmarks.json"))
    expect(run(dir, proposeArgs("1", "T", "https://x.com/a/status/1", DEEP_DATE)).code).toBe(0)
    const proposed = run(dir, ["check"], { GATE_BASE: base })
    expect(proposed.code).toBe(1)
    expect(proposed.stderr).toContain("skip")
    const at = statusAt(readBookmark(dir, "1"))
    writeFileSync(bookmarkPath(dir, "1"), skippedBytes("1", "T", "https://x.com/a/status/1", DEEP_DATE, at, "duplicate"))
    expect(run(dir, ["check"], { GATE_BASE: base }).code).toBe(0)
    writeFileSync(bookmarkPath(dir, "1"), skippedBytes("1", "T", "https://x.com/a/status/1", DEEP_DATE, at, "other"))
    const changed = run(dir, ["check"], { GATE_BASE: base })
    expect(changed.code).toBe(1)
    expect(changed.stderr).toContain("skip")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("check rejects two approved bookmarks with the same slug", () => {
  const dir = initRepo()
  try {
    const at = "2026-11-03T08:32:00.000Z"
    mkdirSync(join(dir, "tracking", "bookmarks"))
    writeFileSync(
      bookmarkPath(dir, "1"),
      approvedBytes("1", "T", "https://x.com/a/status/1", DEEP_DATE, at, "geoinflow-demo"),
    )
    writeFileSync(
      bookmarkPath(dir, "2"),
      approvedBytes("2", "U", "https://x.com/b/status/2", GEO_DATE, at, "geoinflow-demo"),
    )
    const base = commitAll(dir)
    const first = snapshot(dir, "1")
    const second = snapshot(dir, "2")
    const result = run(dir, ["check"], { GATE_BASE: base })
    expect(result.code).toBe(1)
    expect(result.stderr).toContain("geoinflow-demo")
    expect(snapshot(dir, "1")).toEqual(first)
    expect(snapshot(dir, "2")).toEqual(second)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("check rejects a bookmark that the merge base still has when the file is gone", () => {
  const dir = initRepo()
  try {
    expect(run(dir, proposeArgs("1", "T", "https://x.com/a/status/1", DEEP_DATE)).code).toBe(0)
    const base = commitAll(dir)
    rmSync(bookmarkPath(dir, "1"))
    const result = run(dir, ["check"], { GATE_BASE: base })
    expect(result.code).toBe(1)
    expect(result.stderr).toContain("missing")
    expect(existsSync(bookmarkPath(dir, "1"))).toBe(false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("check reads identities from the monolith and keeps the source date", () => {
  const dir = initRepo()
  try {
    writeFileSync(join(dir, "tracking", "seen-bookmarks.json"), monolith("1", "T", "https://x.com/a/status/1", DEEP_DATE))
    const base = commitAll(dir)
    rmSync(join(dir, "tracking", "seen-bookmarks.json"))
    expect(run(dir, proposeArgs("1", "T", "https://x.com/a/status/1", DEEP_DATE)).code).toBe(0)
    expect(run(dir, ["approve", "--id", "1", "--slug", "geoinflow-demo"]).code).toBe(0)
    expect(run(dir, ["check"], { GATE_BASE: base }).code).toBe(0)

    writeFileSync(bookmarkPath(dir, "1"), readBookmark(dir, "1").replace(DEEP_DATE, "2026-11-03T00:00:00.000Z"))
    const stamped = snapshot(dir, "1")
    const result = run(dir, ["check"], { GATE_BASE: base })
    expect(result.code).toBe(1)
    expect(result.stderr).toContain("date")
    expect(snapshot(dir, "1")).toEqual(stamped)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("check fails when the merge base has both bookmark formats", () => {
  const dir = initRepo()
  try {
    writeFileSync(join(dir, "tracking", "seen-bookmarks.json"), monolith("1", "T", "https://x.com/a/status/1", DEEP_DATE))
    expect(run(dir, ["check"]).code).toBe(1)
    rmSync(join(dir, "tracking", "seen-bookmarks.json"))
    expect(run(dir, proposeArgs("1", "T", "https://x.com/a/status/1", DEEP_DATE)).code).toBe(0)
    writeFileSync(join(dir, "tracking", "seen-bookmarks.json"), monolith("1", "T", "https://x.com/a/status/1", DEEP_DATE))
    const both = run(dir, ["check"])
    expect(both.code).toBe(1)
    expect(both.stderr).toContain("both present")
    const base = commitAll(dir)
    rmSync(join(dir, "tracking", "seen-bookmarks.json"))
    const result = run(dir, ["check"], { GATE_BASE: base })
    expect(result.code).toBe(1)
    expect(result.stderr).toContain("tracking/seen-bookmarks.json")
    expect(result.stderr).toContain("tracking/bookmarks")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("show prints the records in id order", () => {
  const dir = initRepo()
  try {
    expect(run(dir, proposeArgs("2", "U", "https://x.com/b/status/2", GEO_DATE)).code).toBe(0)
    expect(run(dir, proposeArgs("1", "T", "https://x.com/a/status/1", DEEP_DATE)).code).toBe(0)
    const result = run(dir, ["show"])
    expect(result.code).toBe(0)
    expect(result.stderr).toBe("")
    expect(result.stdout).toBe(
      `[\n  ${indent(proposedBytes("1", "T", "https://x.com/a/status/1", DEEP_DATE, statusAt(readBookmark(dir, "1"))))},\n  ${indent(proposedBytes("2", "U", "https://x.com/b/status/2", GEO_DATE, statusAt(readBookmark(dir, "2"))))}\n]\n`,
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("a bad id or an unknown command writes nothing", () => {
  const dir = initRepo()
  try {
    expect(run(dir, proposeArgs("../1", "T", "https://x.com/a/status/1", DEEP_DATE)).code).toBe(1)
    expect(run(dir, ["nope"]).code).toBe(1)
    expect(run(dir, ["propose", "--id", "1"]).code).toBe(1)
    expect(existsSync(join(dir, "tracking", "bookmarks"))).toBe(false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("the committed bookmarks replace the monolith", () => {
  expect(existsSync(join(repoRoot, "tracking", "seen-bookmarks.json"))).toBe(false)
  expect(readFileSync(join(repoRoot, "tracking", "bookmarks", `${GEO_ID}.json`), "utf8")).toBe(
    approvedBytes(GEO_ID, GEO_TITLE, GEO_URL, GEO_DATE, GEO_AT, "geoinflow-demo"),
  )
  expect(readFileSync(join(repoRoot, "tracking", "bookmarks", `${DEEP_ID}.json`), "utf8")).toBe(
    approvedBytes(DEEP_ID, DEEP_TITLE, DEEP_URL, DEEP_DATE, DEEP_AT, "deeptutor-demo"),
  )
  expect(readFileSync(join(repoRoot, "tracking", "bookmarks", `${DEEP_ID}.json`), "utf8")).not.toContain("T00:00:00")
})

test("check accepts the committed bookmarks against origin/main", () => {
  const result = run(repoRoot, ["check"], { GATE_BASE: undefined, GATE_BASE_REF: undefined, GITHUB_BASE_REF: undefined })
  expect(result.stderr).toBe("")
  expect(result.code).toBe(0)
  const shown = run(repoRoot, ["show"])
  expect(shown.code).toBe(0)
  expect(shown.stdout).toBe(
    `[\n  ${indent(approvedBytes(GEO_ID, GEO_TITLE, GEO_URL, GEO_DATE, GEO_AT, "geoinflow-demo"))},\n  ${indent(approvedBytes(DEEP_ID, DEEP_TITLE, DEEP_URL, DEEP_DATE, DEEP_AT, "deeptutor-demo"))}\n]\n`,
  )
})

function proposedBytes(id: string, title: string, url: string, date: string, at: string): string {
  return `{
  "id": ${JSON.stringify(id)},
  "title": ${JSON.stringify(title)},
  "url": ${JSON.stringify(url)},
  "date": ${JSON.stringify(date)},
  "status": {
    "phase": "proposed",
    "at": ${JSON.stringify(at)}
  }
}
`
}

function approvedBytes(id: string, title: string, url: string, date: string, at: string, slug: string): string {
  return `{
  "id": ${JSON.stringify(id)},
  "title": ${JSON.stringify(title)},
  "url": ${JSON.stringify(url)},
  "date": ${JSON.stringify(date)},
  "status": {
    "phase": "approved",
    "at": ${JSON.stringify(at)},
    "slug": ${JSON.stringify(slug)}
  }
}
`
}

function skippedBytes(id: string, title: string, url: string, date: string, at: string, reason: string): string {
  return `{
  "id": ${JSON.stringify(id)},
  "title": ${JSON.stringify(title)},
  "url": ${JSON.stringify(url)},
  "date": ${JSON.stringify(date)},
  "status": {
    "phase": "skipped",
    "at": ${JSON.stringify(at)},
    "reason": ${JSON.stringify(reason)}
  }
}
`
}

function indent(bytes: string): string {
  return bytes.trimEnd().replaceAll("\n", "\n  ")
}

function monolith(id: string, title: string, url: string, date: string): string {
  return `{
  "proposed": [],
  "approved": [
    {
      "id": ${JSON.stringify(id)},
      "title": ${JSON.stringify(title)},
      "url": ${JSON.stringify(url)},
      "date": ${JSON.stringify(date)},
      "slug": "geoinflow-demo",
      "approvedAt": "2026-11-02T04:22:00.000Z"
    }
  ],
  "skipped": []
}
`
}

function skippedMonolith(id: string, title: string, url: string, date: string, reason: string): string {
  return `{
  "proposed": [],
  "approved": [],
  "skipped": [
    {
      "id": ${JSON.stringify(id)},
      "title": ${JSON.stringify(title)},
      "url": ${JSON.stringify(url)},
      "date": ${JSON.stringify(date)},
      "reason": ${JSON.stringify(reason)}
    }
  ]
}
`
}

function proposeArgs(id: string, title: string, url: string, date: string): string[] {
  return ["propose", "--id", id, "--title", title, "--url", url, "--date", date]
}

function bookmarkPath(dir: string, id: string): string {
  return join(dir, "tracking", "bookmarks", `${id}.json`)
}

function readBookmark(dir: string, id: string): string {
  return readFileSync(bookmarkPath(dir, id), "utf8")
}

function snapshot(dir: string, id: string): { readonly bytes: string; readonly mtimeNs: bigint } {
  const path = bookmarkPath(dir, id)
  return { bytes: readFileSync(path, "utf8"), mtimeNs: statSync(path).mtimeNs }
}

function run(cwd: string, args: readonly string[], overrides?: Record<string, string | undefined>): RunResult {
  const env: NodeJS.ProcessEnv = { ...process.env }
  if (overrides !== undefined) {
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) delete env[key]
      else env[key] = value
    }
  }
  const result = spawnSync(process.execPath, [cli, ...args], { cwd, env, encoding: "utf8" })
  return { code: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" }
}

function statusAt(bytes: string): string {
  const value: unknown = JSON.parse(bytes)
  if (!isRecord(value) || !isRecord(value.status) || typeof value.status.at !== "string") {
    throw new Error("bookmark has no status time")
  }
  return value.status.at
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function initRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "bookmarks-"))
  mkdirSync(join(dir, "tracking"), { recursive: true })
  git(dir, ["init"])
  return dir
}

function commitAll(dir: string): string {
  git(dir, ["add", "-A"])
  git(dir, ["-c", "user.email=ledger@example.com", "-c", "user.name=ledger", "-c", "commit.gpgsign=false", "commit", "-m", "bookmarks"])
  return git(dir, ["rev-parse", "HEAD"])
}

function git(cwd: string, args: readonly string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" })
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `git ${args.join(" ")} failed`)
  return result.stdout.trim()
}
