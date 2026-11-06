import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test } from "bun:test"
import { parseJsonc } from "./jsonc.ts"
import { checkApp } from "./predicate.ts"
import { stampApp } from "./stamp.ts"

const scaffoldConfig = `{
  "compilerOptions": {
    "baseUrl": ".",
    "strict": false,
    // paths stay relative to this file
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src"],
}
`

test("parseJsonc keeps comment text out and keeps string contents", () => {
  expect(parseJsonc('{"note": "http://example.test", "n": 1,}')).toEqual({
    note: "http://example.test",
    n: 1,
  })
  expect(parseJsonc('{ /* block */ "ok": true }')).toEqual({ ok: true })
  expect(parseJsonc(scaffoldConfig)).toMatchObject({
    compilerOptions: { baseUrl: ".", strict: false },
  })
})

test("stamp makes the tsconfig predicate pass and leaves the style file alone", () => {
  const dir = mkdtempSync(join(tmpdir(), "gate-app-"))
  try {
    writeFileSync(join(dir, "tsconfig.app.json"), scaffoldConfig)
    writeFileSync(join(dir, "components.json"), '{"style":"base-lyra"}\n')
    writeFileSync(
      join(dir, "tsconfig.json"),
      `${JSON.stringify({
        files: [],
        references: [{ path: "./tsconfig.app.json" }, { path: "./tsconfig.test.json" }],
      })}\n`,
    )
    expect(checkApp(dir).length).toBeGreaterThan(0)
    expect(stampApp(dir)).toEqual([])
    expect(checkApp(dir)).toEqual([])
    const app = parseJsonc(readFileSync(join(dir, "tsconfig.app.json"), "utf8"))
    expect(app).toMatchObject({
      compilerOptions: { strict: true, rootDir: "src" },
      exclude: ["src/**/*.test.ts"],
    })
    expect(JSON.stringify(app)).not.toContain("baseUrl")
    const solution = parseJsonc(readFileSync(join(dir, "tsconfig.json"), "utf8"))
    expect(solution).toEqual({ files: [], references: [{ path: "./tsconfig.app.json" }] })
    expect(readFileSync(join(dir, "components.json"), "utf8")).toContain("base-lyra")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("a style other than base-lyra fails the predicate and stamp does not rewrite it", () => {
  const dir = mkdtempSync(join(tmpdir(), "gate-style-"))
  try {
    writeFileSync(join(dir, "tsconfig.app.json"), scaffoldConfig)
    writeFileSync(join(dir, "components.json"), '{"style":"minimalist"}\n')
    expect(stampApp(dir)).toEqual([])
    const problems = checkApp(dir)
    expect(problems.some((problem) => problem.includes("base-lyra"))).toBe(true)
    expect(readFileSync(join(dir, "components.json"), "utf8")).toContain("minimalist")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
