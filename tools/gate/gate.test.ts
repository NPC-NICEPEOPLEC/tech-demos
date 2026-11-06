import { readdirSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { expect, test } from "bun:test"
import { runScout } from "./gate.ts"

const here = dirname(fileURLToPath(import.meta.url))

test("the gate does not import tracking", () => {
  for (const name of readdirSync(here)) {
    if (!name.endsWith(".ts")) continue
    const text = readFileSync(join(here, name), "utf8")
    expect(text).not.toMatch(/\bfrom\s+["'][^"']*tracking/)
    expect(text).not.toMatch(/\bimport\s*\(\s*["'][^"']*tracking/)
  }
})

test("a scout diff stays red while tracking/seen-bookmarks.json remains", () => {
  const dir = mkdtempSync(join(tmpdir(), "gate-scout-"))
  try {
    mkdirSync(join(dir, "tracking"))
    writeFileSync(join(dir, "tracking", "seen-bookmarks.json"), "{}\n")
    writeFileSync(join(dir, "tracking", "cli.ts"), "process.exit(0)\n")
    const result = runScout(dir)
    expect(result.code).toBe(1)
    expect(result.message).toContain("tracking/seen-bookmarks.json")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("a scout diff fails when the ledger command is missing", () => {
  const dir = mkdtempSync(join(tmpdir(), "gate-scout-"))
  try {
    const result = runScout(dir)
    expect(result.code).toBe(1)
    expect(result.message).toContain("tracking/cli.ts")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("a scout diff passes when the monolith is gone and the ledger command exits 0", () => {
  const dir = mkdtempSync(join(tmpdir(), "gate-scout-"))
  try {
    mkdirSync(join(dir, "tracking"))
    writeFileSync(join(dir, "tracking", "cli.ts"), "process.exit(0)\n")
    expect(runScout(dir).code).toBe(0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("a failing ledger command fails the scout lane", () => {
  const dir = mkdtempSync(join(tmpdir(), "gate-scout-"))
  try {
    mkdirSync(join(dir, "tracking"))
    writeFileSync(join(dir, "tracking", "cli.ts"), "process.exit(1)\n")
    expect(runScout(dir).code).not.toBe(0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
