type Purpose = "Training" | "Search" | "User"

export type HitRow = {
  readonly botId: string
  readonly bot: string
  readonly vendor: string
  readonly purpose: Purpose
  readonly path: string
  readonly hits: number
}

export type BotTotal = {
  readonly botId: string
  readonly bot: string
  readonly vendor: string
  readonly hits: number
}

export type Analysis = {
  readonly parsedLines: number
  readonly skippedLines: number
  readonly aiHits: number
  readonly unmatchedLines: number
  readonly rows: readonly HitRow[]
  readonly botTotals: readonly BotTotal[]
  readonly zeroCrawlPages: readonly string[]
  readonly crawledKeyPages: readonly string[]
}

type Crawler = {
  readonly id: string
  readonly name: string
  readonly vendor: string
  readonly purpose: Purpose
}

const CRAWLERS: readonly Crawler[] = [
  { id: "oai-searchbot", name: "OAI-SearchBot", vendor: "OpenAI", purpose: "Search" },
  { id: "gptbot", name: "GPTBot", vendor: "OpenAI", purpose: "Training" },
  { id: "chatgpt-user", name: "ChatGPT-User", vendor: "OpenAI", purpose: "User" },
  { id: "claude-searchbot", name: "Claude-SearchBot", vendor: "Anthropic", purpose: "Search" },
  { id: "claude-user", name: "Claude-User", vendor: "Anthropic", purpose: "User" },
  { id: "claudebot", name: "ClaudeBot", vendor: "Anthropic", purpose: "Training" },
  { id: "anthropic-ai", name: "anthropic-ai", vendor: "Anthropic", purpose: "Training" },
  { id: "perplexity-user", name: "Perplexity-User", vendor: "Perplexity", purpose: "User" },
  { id: "perplexitybot", name: "PerplexityBot", vendor: "Perplexity", purpose: "Search" },
  { id: "google-cloudvertexbot", name: "Google-CloudVertexBot", vendor: "Google", purpose: "User" },
  { id: "amazonbot", name: "Amazonbot", vendor: "Amazon", purpose: "Search" },
  { id: "bytespider", name: "Bytespider", vendor: "ByteDance", purpose: "Training" },
  { id: "meta-externalfetcher", name: "Meta-ExternalFetcher", vendor: "Meta", purpose: "User" },
  { id: "meta-externalagent", name: "Meta-ExternalAgent", vendor: "Meta", purpose: "Training" },
  { id: "ccbot", name: "CCBot", vendor: "Common Crawl", purpose: "Training" },
  { id: "diffbot", name: "Diffbot", vendor: "Diffbot", purpose: "Training" },
  { id: "cohere-ai", name: "cohere-ai", vendor: "Cohere", purpose: "Training" },
  { id: "youbot", name: "YouBot", vendor: "You.com", purpose: "Search" },
  { id: "duckassistbot", name: "DuckAssistBot", vendor: "DuckDuckGo", purpose: "Search" },
  { id: "ai2bot", name: "AI2Bot", vendor: "AI2", purpose: "Training" },
  { id: "icc-crawler", name: "ICC-Crawler", vendor: "AI2", purpose: "Training" },
  { id: "petalbot", name: "PetalBot", vendor: "Huawei", purpose: "Search" },
]

const CRAWLERS_BY_TOKEN = new Map(CRAWLERS.map((crawler) => [crawler.name.toLowerCase(), crawler]))

const DIRECTIVES = new Set(["google-extended", "applebot-extended"])

export function analyzeLog(log: string, keyPagesText: string): Analysis {
  let parsedLines = 0
  let skippedLines = 0
  let aiHits = 0
  let unmatchedLines = 0
  const counts = new Map<string, HitRow>()
  const crawled = new Set<string>()

  for (const line of log.split(/\r?\n/)) {
    if (line.trim().length === 0) continue
    const hit = parseCombinedLine(line)
    if (!hit) {
      skippedLines += 1
      continue
    }
    parsedLines += 1
    const crawler = crawlerFor(hit.userAgent)
    if (!crawler) {
      unmatchedLines += 1
      continue
    }
    aiHits += 1
    crawled.add(hit.path)
    const key = `${crawler.id}\t${hit.path}`
    const existing = counts.get(key)
    if (existing) {
      counts.set(key, { ...existing, hits: existing.hits + 1 })
    } else {
      counts.set(key, {
        botId: crawler.id,
        bot: crawler.name,
        vendor: crawler.vendor,
        purpose: crawler.purpose,
        path: hit.path,
        hits: 1,
      })
    }
  }

  const rows = [...counts.values()].sort(compareRows)
  const totals = new Map<string, BotTotal>()
  for (const row of rows) {
    const total = totals.get(row.botId)
    if (total) {
      totals.set(row.botId, { ...total, hits: total.hits + row.hits })
    } else {
      totals.set(row.botId, {
        botId: row.botId,
        bot: row.bot,
        vendor: row.vendor,
        hits: row.hits,
      })
    }
  }
  const botTotals = [...totals.values()].sort((left, right) => {
    if (right.hits !== left.hits) return right.hits - left.hits
    return left.bot.localeCompare(right.bot)
  })

  const keyPages = parseKeyPages(keyPagesText)
  return {
    parsedLines,
    skippedLines,
    aiHits,
    unmatchedLines,
    rows,
    botTotals,
    zeroCrawlPages: keyPages.filter((path) => !crawled.has(path)),
    crawledKeyPages: keyPages.filter((path) => crawled.has(path)),
  }
}

function crawlerFor(userAgent: string): Crawler | null {
  for (const match of userAgent.matchAll(/[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*/g)) {
    const token = match[0].toLowerCase()
    if (DIRECTIVES.has(token)) continue
    const crawler = CRAWLERS_BY_TOKEN.get(token)
    if (crawler) return crawler
  }
  return null
}

function parseCombinedLine(line: string): { readonly path: string; readonly userAgent: string } | null {
  const text = line.trim()
  let index = 0
  const host = readToken(text, index)
  if (!host) return null
  index = skipGaps(text, host.next)
  const ident = readToken(text, index)
  if (!ident) return null
  index = skipGaps(text, ident.next)
  const user = readToken(text, index)
  if (!user) return null
  index = skipGaps(text, user.next)
  const time = readBracket(text, index)
  if (!time) return null
  index = skipGaps(text, time.next)
  const request = readQuoted(text, index)
  if (!request) return null
  const requestParts = request.value.split(/\s+/)
  const method = requestParts[0]
  const rawPath = requestParts[1]
  if (!method || !/^[A-Z]+$/.test(method) || !rawPath) return null
  index = skipGaps(text, request.next)
  const status = readToken(text, index)
  if (!status || !/^\d{3}$/.test(status.value)) return null
  index = skipGaps(text, status.next)
  const bytes = readToken(text, index)
  if (!bytes) return null
  index = skipGaps(text, bytes.next)
  const referer = readQuoted(text, index)
  if (!referer) return null
  index = skipGaps(text, referer.next)
  const agent = readQuoted(text, index)
  if (!agent || agent.value.length === 0) return null
  return { path: normalizePath(rawPath), userAgent: agent.value }
}

function readQuoted(
  text: string,
  index: number,
): { readonly value: string; readonly next: number } | null {
  if (text[index] !== '"') return null
  let next = index + 1
  let value = ""
  while (next < text.length) {
    const char = text[next]
    if (char === "\\") {
      const escaped = text[next + 1]
      if (escaped === undefined) return null
      value += escaped
      next += 2
      continue
    }
    if (char === '"') return { value, next: next + 1 }
    if (char === undefined) return null
    value += char
    next += 1
  }
  return null
}

function readBracket(text: string, index: number): { readonly next: number } | null {
  if (text[index] !== "[") return null
  const end = text.indexOf("]", index + 1)
  if (end < 0) return null
  return { next: end + 1 }
}

function readToken(
  text: string,
  index: number,
): { readonly value: string; readonly next: number } | null {
  if (index >= text.length || isGap(text[index])) return null
  let next = index
  while (next < text.length && !isGap(text[next])) next += 1
  return { value: text.slice(index, next), next }
}

function skipGaps(text: string, index: number): number {
  let next = index
  while (next < text.length && isGap(text[next])) next += 1
  return next
}

function isGap(char: string | undefined): boolean {
  return char === " " || char === "\t"
}

function normalizePath(raw: string): string {
  let path = raw.trim()
  if (path.length === 0) return "/"

  if (path.startsWith("http://") || path.startsWith("https://")) {
    try {
      path = new URL(path).pathname
    } catch {
      path = raw.trim()
    }
  }

  const query = path.indexOf("?")
  if (query >= 0) path = path.slice(0, query)
  const hash = path.indexOf("#")
  if (hash >= 0) path = path.slice(0, hash)
  if (!path.startsWith("/")) path = `/${path}`
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1)
  return path
}

function parseKeyPages(input: string): readonly string[] {
  const pages: string[] = []
  const seen = new Set<string>()
  for (const part of input.split(/[\s,]+/)) {
    if (part.trim().length === 0) continue
    const path = normalizePath(part)
    if (seen.has(path)) continue
    seen.add(path)
    pages.push(path)
  }
  return pages
}

function compareRows(left: HitRow, right: HitRow): number {
  if (right.hits !== left.hits) return right.hits - left.hits
  const byBot = left.bot.localeCompare(right.bot)
  if (byBot !== 0) return byBot
  return left.path.localeCompare(right.path)
}
