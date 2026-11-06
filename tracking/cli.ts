import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { spawnSync } from "node:child_process"
import { pathToFileURL } from "node:url"
import {
  approveBookmark,
  canonicalBytes,
  canonicalProblems,
  identitiesFromMonolith,
  identityProblems,
  isBookmarkId,
  isSlug,
  loadLedger,
  parseBookmark,
  proposeBookmark,
  readBookmarkDir,
  skipBookmark,
  storeProblem,
  type Bookmark,
  type BookmarkId,
  type Identity,
  type IdentityRead,
  type Slug,
  type Transition,
} from "./ledger.ts"

const USAGE = [
  "usage: bun tracking/cli.ts propose --id <id> --title <title> --url <url> --date <date>",
  "       bun tracking/cli.ts approve --id <id> --slug <slug>",
  "       bun tracking/cli.ts skip --id <id> --reason <reason>",
  "       bun tracking/cli.ts show",
  "       bun tracking/cli.ts check",
].join("\n")

type Command = "propose" | "approve" | "skip" | "show" | "check"

type Flags = {
  id?: string
  title?: string
  url?: string
  date?: string
  slug?: string
  reason?: string
}

type FlagName = keyof Flags

function main(): number {
  try {
    return run(process.argv.slice(2))
  } catch (error) {
    const message = error instanceof Error ? error.message : "the bookmark command failed"
    return fail(message)
  }
}

function run(argv: readonly string[]): number {
  const parsed = parseArgv(argv)
  if (!parsed.ok) return fail(parsed.reason)
  const root = repoRoot()
  switch (parsed.command) {
    case "propose":
      return propose(root, parsed.flags)
    case "approve":
      return approve(root, parsed.flags)
    case "skip":
      return skip(root, parsed.flags)
    case "show":
      return show(root)
    case "check":
      return check(root)
    default: {
      const unreachable: never = parsed.command
      return fail(`unhandled command ${String(unreachable)}`)
    }
  }
}

function propose(root: string, flags: Flags): number {
  const identity = readIdentity(flags)
  if (!identity.ok) return fail(identity.reason)
  const ledger = loadLedger(root)
  return applyTransition(root, proposeBookmark(ledger, identity.identity, now()))
}

function approve(root: string, flags: Flags): number {
  const id = readId(flags)
  if (!id.ok) return fail(id.reason)
  const slug = readSlug(flags)
  if (!slug.ok) return fail(slug.reason)
  const ledger = loadLedger(root)
  return applyTransition(root, approveBookmark(ledger, id.id, slug.slug, now()))
}

function skip(root: string, flags: Flags): number {
  const id = readId(flags)
  if (!id.ok) return fail(id.reason)
  const reason = flags.reason
  if (reason === undefined) return fail("usage: bun tracking/cli.ts skip --id <id> --reason <reason>")
  if (reason.length === 0) return fail("a skip reason is empty")
  const ledger = loadLedger(root)
  return applyTransition(root, skipBookmark(ledger, id.id, reason, now()))
}

function show(root: string): number {
  const ledger = loadLedger(root)
  const records = [...ledger.values()]
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
    .map((bookmark) => JSON.parse(canonicalBytes(bookmark).trimEnd()))
  process.stdout.write(`${JSON.stringify(records, null, 2)}\n`)
  return 0
}

function check(root: string): number {
  const store = storeProblem(root)
  if (store !== undefined) return fail(store)
  const dir = join(root, "tracking", "bookmarks")
  const read = existsSync(dir)
    ? readBookmarkDir(dir)
    : { bookmarks: new Map<BookmarkId, Bookmark>(), files: [], problems: [] }
  const problems = [...read.problems, ...canonicalProblems(read.files, read.bookmarks)]
  const identities = identitiesAtBase(root, resolveMergeBase(root))
  if (!identities.ok) problems.push(identities.reason)
  else problems.push(...identityProblems(read.bookmarks, identities.identities))
  if (problems.length > 0) return fail(problems.join("\n"))
  return 0
}

function applyTransition(root: string, transition: Transition): number {
  if (!transition.ok) return fail(transition.reason)
  if (!transition.wrote) return 0
  writeBookmark(root, transition.bookmark)
  return 0
}

function writeBookmark(root: string, bookmark: Bookmark): void {
  const dir = join(root, "tracking", "bookmarks")
  mkdirSync(dir, { recursive: true })
  const target = join(dir, `${bookmark.id}.json`)
  const tmp = join(dir, `.${bookmark.id}.json.tmp`)
  writeFileSync(tmp, canonicalBytes(bookmark))
  try {
    renameSync(tmp, target)
  } finally {
    if (existsSync(tmp)) rmSync(tmp)
  }
}

function identitiesAtBase(root: string, base: string): IdentityRead {
  const monolith = gitShow(root, base, "tracking/seen-bookmarks.json")
  const paths = listFiles(root, base, "tracking/bookmarks").filter((path) => path.endsWith(".json"))
  if (monolith !== undefined && paths.length > 0) {
    return {
      ok: false,
      reason: "the merge base has tracking/seen-bookmarks.json and tracking/bookmarks together",
    }
  }
  if (monolith !== undefined) return parseMonolith(monolith)
  const identities: Identity[] = []
  for (const path of paths) {
    const text = gitShow(root, base, path)
    if (text === undefined) return { ok: false, reason: `${path} is missing at ${base}` }
    const parsed = parseBookmarkText(text, path)
    if (!parsed.ok) return parsed
    const expected = `tracking/bookmarks/${parsed.bookmark.id}.json`
    if (path !== expected) return { ok: false, reason: `${path} does not match id ${parsed.bookmark.id}` }
    identities.push({
      id: parsed.bookmark.id,
      title: parsed.bookmark.title,
      url: parsed.bookmark.url,
      date: parsed.bookmark.date,
    })
  }
  return { ok: true, identities }
}

function parseMonolith(text: string): IdentityRead {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (error) {
    const detail = error instanceof Error ? error.message : "invalid JSON"
    return { ok: false, reason: `tracking/seen-bookmarks.json is not valid JSON (${detail})` }
  }
  return identitiesFromMonolith(value)
}

function parseBookmarkText(
  text: string,
  path: string,
): { readonly ok: true; readonly bookmark: Bookmark } | { readonly ok: false; readonly reason: string } {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (error) {
    const detail = error instanceof Error ? error.message : "invalid JSON"
    return { ok: false, reason: `${path} is not valid JSON (${detail})` }
  }
  const parsed = parseBookmark(value)
  if (!parsed.ok) return { ok: false, reason: `${path} ${parsed.reason}` }
  return parsed
}

function readIdentity(flags: Flags): { readonly ok: true; readonly identity: Identity } | { readonly ok: false; readonly reason: string } {
  if (flags.id === undefined || flags.title === undefined || flags.url === undefined || flags.date === undefined) {
    return { ok: false, reason: "usage: bun tracking/cli.ts propose --id <id> --title <title> --url <url> --date <date>" }
  }
  if (!isBookmarkId(flags.id)) return { ok: false, reason: `bookmark id ${flags.id} is not a decimal string` }
  if (flags.title.length === 0) return { ok: false, reason: "a bookmark title is empty" }
  if (flags.url.length === 0) return { ok: false, reason: "a bookmark url is empty" }
  if (flags.date.length === 0) return { ok: false, reason: "a bookmark date is empty" }
  return { ok: true, identity: { id: flags.id, title: flags.title, url: flags.url, date: flags.date } }
}

function readId(flags: Flags): { readonly ok: true; readonly id: BookmarkId } | { readonly ok: false; readonly reason: string } {
  if (flags.id === undefined) return { ok: false, reason: "a bookmark id is missing" }
  if (!isBookmarkId(flags.id)) return { ok: false, reason: `bookmark id ${flags.id} is not a decimal string` }
  return { ok: true, id: flags.id }
}

function readSlug(flags: Flags): { readonly ok: true; readonly slug: Slug } | { readonly ok: false; readonly reason: string } {
  if (flags.slug === undefined) return { ok: false, reason: "usage: bun tracking/cli.ts approve --id <id> --slug <slug>" }
  if (!isSlug(flags.slug)) return { ok: false, reason: `slug ${flags.slug} is not an app slug` }
  return { ok: true, slug: flags.slug }
}

function parseArgv(
  argv: readonly string[],
): { readonly ok: true; readonly command: Command; readonly flags: Flags } | { readonly ok: false; readonly reason: string } {
  const command = argv[0]
  if (command === undefined || !isCommand(command)) return { ok: false, reason: USAGE }
  const flags: Flags = {}
  const seen = new Set<FlagName>()
  let index = 1
  while (index < argv.length) {
    const token = argv[index]
    if (token === undefined || !token.startsWith("--")) return { ok: false, reason: USAGE }
    const name = token.slice(2)
    if (!isFlagName(name)) return { ok: false, reason: USAGE }
    const value = argv[index + 1]
    if (value === undefined || value.startsWith("--")) return { ok: false, reason: USAGE }
    if (seen.has(name)) return { ok: false, reason: USAGE }
    seen.add(name)
    flags[name] = value
    index += 2
  }
  for (const name of seen) {
    if (!allowed(command).includes(name)) return { ok: false, reason: USAGE }
  }
  return { ok: true, command, flags }
}

function allowed(command: Command): readonly FlagName[] {
  switch (command) {
    case "propose":
      return ["id", "title", "url", "date"]
    case "approve":
      return ["id", "slug"]
    case "skip":
      return ["id", "reason"]
    case "show":
    case "check":
      return []
    default: {
      const unreachable: never = command
      throw new Error(`unhandled command ${String(unreachable)}`)
    }
  }
}

function isCommand(value: string): value is Command {
  return value === "propose" || value === "approve" || value === "skip" || value === "show" || value === "check"
}

function isFlagName(value: string): value is FlagName {
  return value === "id" || value === "title" || value === "url" || value === "date" || value === "slug" || value === "reason"
}

function now(): string {
  return new Date().toISOString()
}

function fail(message: string): number {
  process.stderr.write(`${message}\n`)
  return 1
}

function repoRoot(): string {
  const result = runGit(process.cwd(), ["rev-parse", "--show-toplevel"])
  if (result.code !== 0) throw new Error(result.stderr || "git rev-parse --show-toplevel failed")
  return result.stdout.trim()
}

function resolveMergeBase(root: string): string {
  const explicit = process.env.GATE_BASE
  if (explicit !== undefined && explicit.length > 0) return explicit
  const baseRef = process.env.GATE_BASE_REF ?? process.env.GITHUB_BASE_REF
  const target = baseRef !== undefined && baseRef.length > 0 ? `origin/${baseRef}` : "origin/main"
  const result = runGit(root, ["merge-base", "HEAD", target])
  if (result.code !== 0) throw new Error(result.stderr || `git merge-base HEAD ${target} failed`)
  return result.stdout.trim()
}

function gitShow(root: string, base: string, path: string): string | undefined {
  const result = runGit(root, ["show", `${base}:${path}`])
  if (result.code === 0) return result.stdout
  if (result.stderr.includes("does not exist") || result.stderr.includes("exists on disk, but not in")) return undefined
  throw new Error(result.stderr || `git show ${base}:${path} failed`)
}

function listFiles(root: string, base: string, prefix: string): readonly string[] {
  const result = runGit(root, ["ls-tree", "-r", "--name-only", base, prefix])
  if (result.code !== 0) throw new Error(result.stderr || `git ls-tree ${base} ${prefix} failed`)
  return result.stdout.split("\n").filter((line) => line.length > 0)
}

type GitResult = { readonly code: number; readonly stdout: string; readonly stderr: string }

function runGit(cwd: string, args: readonly string[]): GitResult {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" })
  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: (result.stderr ?? "").trim() || result.error?.message || "",
  }
}

function isDirectRun(): boolean {
  if (import.meta.main === true) return true
  const entry = process.argv[1]
  if (entry === undefined) return false
  return import.meta.url === pathToFileURL(resolve(entry)).href
}

if (isDirectRun()) process.exit(main())
