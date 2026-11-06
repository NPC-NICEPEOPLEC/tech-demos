import { describe, expect, test } from "bun:test"
import * as analyze from "./analyze.ts"
import { SAMPLE_LOG } from "./sample-log.ts"

const { analyzeLog } = analyze

function logLine(path: string, agent: string, referer = "-"): string {
  return `20.15.1.8 - - [02/Nov/2026:03:14:22 +0000] "GET ${path} HTTP/1.1" 200 100 "${referer}" "${agent}"`
}

describe("analyzeLog", () => {
  test("sample log classifies crawlers and leaves pricing and docs at zero", () => {
    const analysis = analyzeLog(SAMPLE_LOG, "/, /pricing, /docs")
    expect(analysis.parsedLines).toBe(17)
    expect(analysis.skippedLines).toBe(1)
    expect(analysis.aiHits).toBe(13)
    expect(analysis.unmatchedLines).toBe(4)
    expect(analysis.zeroCrawlPages).toEqual(["/pricing", "/docs"])
    expect(analysis.crawledKeyPages).toEqual(["/"])
    expect(analysis.botTotals[0]).toMatchObject({ bot: "GPTBot", hits: 3 })
    expect(analysis.rows[0]).toMatchObject({ bot: "GPTBot", path: "/blog/what-is-geo", hits: 2 })
    expect(analysis.rows.some((row) => row.path === "/pricing")).toBe(false)
    expect(analysis.rows.some((row) => row.bot === "Google-Extended")).toBe(false)
    expect(analysis.botTotals.reduce((sum, row) => sum + row.hits, 0)).toBe(13)
  })

  test("a referer with an escaped quote still parses", () => {
    const analysis = analyzeLog(
      logLine("/docs", "compatible; GPTBot/1.2", String.raw`https://example.com/a\"b`),
      "/docs",
    )
    expect(analysis.parsedLines).toBe(1)
    expect(analysis.skippedLines).toBe(0)
    expect(analysis.aiHits).toBe(1)
    expect(analysis.rows[0]).toMatchObject({ bot: "GPTBot", path: "/docs", purpose: "Training" })
    expect(analysis.crawledKeyPages).toEqual(["/docs"])
  })

  test("Google-Extended and Applebot-Extended add no hit", () => {
    const analysis = analyzeLog(
      [
        logLine("/", "Mozilla/5.0 (compatible; Google-Extended; +http://www.google.com/bot.html)"),
        logLine("/about", "Mozilla/5.0 (compatible; Applebot-Extended)"),
      ].join("\n"),
      "/",
    )
    expect(analysis.parsedLines).toBe(2)
    expect(analysis.aiHits).toBe(0)
    expect(analysis.unmatchedLines).toBe(2)
    expect(analysis.rows).toEqual([])
    expect(analysis.zeroCrawlPages).toEqual(["/"])
  })

  test("Claude-SearchBot does not count as ClaudeBot", () => {
    const analysis = analyzeLog(
      [
        logLine("/changelog", "compatible; Claude-SearchBot/1.0"),
        logLine("/blog", "compatible; ClaudeBot/1.0"),
        logLine("/other", "compatible; MyClaudeBot/1.0"),
      ].join("\n"),
      "/",
    )
    expect(analysis.aiHits).toBe(2)
    expect(analysis.unmatchedLines).toBe(1)
    expect(analysis.rows.map((row) => `${row.bot} ${row.path}`).sort()).toEqual([
      "Claude-SearchBot /changelog",
      "ClaudeBot /blog",
    ])
    expect(analysis.rows.find((row) => row.path === "/changelog")).toMatchObject({
      bot: "Claude-SearchBot",
      purpose: "Search",
    })
  })

  test("a browser hit does not count as a crawl", () => {
    const analysis = analyzeLog(
      logLine("/pricing", "Mozilla/5.0 Chrome/128.0.0.0 Safari/537.36"),
      "/pricing",
    )
    expect(analysis.aiHits).toBe(0)
    expect(analysis.parsedLines).toBe(1)
    expect(analysis.zeroCrawlPages).toEqual(["/pricing"])
  })

  test("Googlebot is parsed and unmatched", () => {
    const analysis = analyzeLog(
      `66.249.66.1 - - [02/Nov/2026:03:14:10 +0000] "GET /robots.txt HTTP/1.1" 200 312 "-" "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"`,
      "/robots.txt",
    )
    expect(analysis.parsedLines).toBe(1)
    expect(analysis.aiHits).toBe(0)
    expect(analysis.unmatchedLines).toBe(1)
  })

  test("a trailing request time still parses", () => {
    const analysis = analyzeLog(
      `127.0.0.1 - - [02/Nov/2026:03:14:22 +0000] "GET /docs/ HTTP/1.1" 200 10 "-" "compatible; GPTBot/1.0" 0.012`,
      "/docs",
    )
    expect(analysis.rows[0]).toMatchObject({ path: "/docs", bot: "GPTBot" })
    expect(analysis.crawledKeyPages).toEqual(["/docs"])
  })

  test("key page text is normalized and deduped", () => {
    const analysis = analyzeLog(
      logLine("/docs/?x=1#top", "compatible; GPTBot/1.0"),
      "/, /pricing, /docs/, pricing",
    )
    expect(analysis.rows[0]).toMatchObject({ path: "/docs" })
    expect(analysis.crawledKeyPages).toEqual(["/docs"])
    expect(analysis.zeroCrawlPages).toEqual(["/", "/pricing"])
  })

  test("analyzeLog is the only runtime export", () => {
    expect(Object.keys(analyze).sort()).toEqual(["analyzeLog"])
  })

  test("prose is skipped", () => {
    const analysis = analyzeLog("this is not a log line", "/pricing")
    expect(analysis.parsedLines).toBe(0)
    expect(analysis.skippedLines).toBe(1)
    expect(analysis.zeroCrawlPages).toEqual(["/pricing"])
  })
})
