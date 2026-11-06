import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const MONOLITH = "tracking/seen-bookmarks.json"
const BOOKMARKS = "tracking/bookmarks"
const ID_PATTERN = /^[0-9]+$/
const SLUG_PATTERN = /^[a-z][a-z0-9]+(?:-[a-z0-9]+)+$/
const FILE_PATTERN = /^([0-9]+)\.json$/

export type BookmarkId = string & { readonly __brand: "BookmarkId" }
export type Slug = string & { readonly __brand: "Slug" }

export type Identity = {
  readonly id: BookmarkId
  readonly title: string
  readonly url: string
  readonly date: string
}

export type BaseRecord = Identity & {
  readonly approval: Slug | undefined
  readonly skip: string | undefined
}

export type BookmarkStatus =
  | { readonly phase: "proposed"; readonly at: string }
  | { readonly phase: "approved"; readonly at: string; readonly slug: Slug }
  | { readonly phase: "skipped"; readonly at: string; readonly reason: string }

export type Bookmark = Identity & { readonly status: BookmarkStatus }

export type Ledger = ReadonlyMap<BookmarkId, Bookmark>

export type Transition =
  | { readonly ok: true; readonly wrote: false }
  | { readonly ok: true; readonly wrote: true; readonly bookmark: Bookmark }
  | { readonly ok: false; readonly reason: string }

export type IdentityRead =
  | { readonly ok: true; readonly identities: readonly BaseRecord[] }
  | { readonly ok: false; readonly reason: string }

type Failure = { readonly ok: false; readonly reason: string }

export function isBookmarkId(value: string): value is BookmarkId {
  return ID_PATTERN.test(value)
}

export function isSlug(value: string): value is Slug {
  return SLUG_PATTERN.test(value)
}

export function canonicalBytes(bookmark: Bookmark): string {
  return `${JSON.stringify(canonicalRecord(bookmark), null, 2)}\n`
}

export function loadLedger(repoRoot: string): Ledger {
  const store = storeProblem(repoRoot)
  if (store !== undefined) throw new Error(store)
  const dir = join(repoRoot, BOOKMARKS)
  if (!existsSync(dir)) return new Map()
  const read = readBookmarkDir(dir)
  if (read.problems.length > 0) throw new Error(read.problems.join("\n"))
  return read.bookmarks
}

export function proposeBookmark(ledger: Ledger, identity: Identity, at: string): Transition {
  const existing = ledger.get(identity.id)
  if (existing === undefined) {
    return {
      ok: true,
      wrote: true,
      bookmark: {
        id: identity.id,
        title: identity.title,
        url: identity.url,
        date: identity.date,
        status: { phase: "proposed", at },
      },
    }
  }
  const field = changedField(existing, identity)
  if (field !== undefined) {
    return { ok: false, reason: `bookmark ${identity.id} already has a different ${field}` }
  }
  return { ok: true, wrote: false }
}

export function approveBookmark(ledger: Ledger, id: BookmarkId, slug: Slug, at: string): Transition {
  const existing = ledger.get(id)
  if (existing === undefined) return { ok: false, reason: `bookmark ${id} is missing` }
  if (existing.status.phase === "skipped") return { ok: false, reason: `bookmark ${id} is skipped` }
  if (existing.status.phase === "approved") {
    if (existing.status.slug === slug) return { ok: true, wrote: false }
    return { ok: false, reason: `bookmark ${id} is already approved with another slug` }
  }
  const owner = approvedOwner(ledger, slug)
  if (owner !== undefined) return { ok: false, reason: `slug ${slug} is already approved` }
  return {
    ok: true,
    wrote: true,
    bookmark: {
      id: existing.id,
      title: existing.title,
      url: existing.url,
      date: existing.date,
      status: { phase: "approved", at, slug },
    },
  }
}

export function skipBookmark(ledger: Ledger, id: BookmarkId, reason: string, at: string): Transition {
  const existing = ledger.get(id)
  if (existing === undefined) return { ok: false, reason: `bookmark ${id} is missing` }
  if (existing.status.phase === "approved") return { ok: false, reason: `bookmark ${id} is approved` }
  if (existing.status.phase === "skipped") {
    if (existing.status.reason === reason) return { ok: true, wrote: false }
    return { ok: false, reason: `bookmark ${id} is already skipped with another reason` }
  }
  return {
    ok: true,
    wrote: true,
    bookmark: {
      id: existing.id,
      title: existing.title,
      url: existing.url,
      date: existing.date,
      status: { phase: "skipped", at, reason },
    },
  }
}

export function identitiesFromMonolith(value: unknown): IdentityRead {
  if (!isRecord(value)) return { ok: false, reason: "tracking/seen-bookmarks.json is not an object" }
  const proposed = identitiesFromEntries(value.proposed, "proposed")
  if (!proposed.ok) return proposed
  const approved = identitiesFromEntries(value.approved, "approved")
  if (!approved.ok) return approved
  const skipped = identitiesFromEntries(value.skipped, "skipped")
  if (!skipped.ok) return skipped
  return uniqueIdentities([...proposed.identities, ...approved.identities, ...skipped.identities])
}

export function parseBookmark(value: unknown): { readonly ok: true; readonly bookmark: Bookmark } | Failure {
  if (!isRecord(value)) return { ok: false, reason: "a bookmark record is not an object" }
  const identity = parseIdentity(value)
  if (!identity.ok) return identity
  const status = parseStatus(value.status)
  if (!status.ok) return status
  return {
    ok: true,
    bookmark: {
      id: identity.identity.id,
      title: identity.identity.title,
      url: identity.identity.url,
      date: identity.identity.date,
      status: status.status,
    },
  }
}

export type BookmarkDirRead = {
  readonly bookmarks: Ledger
  readonly files: readonly { readonly name: string; readonly bytes: string }[]
  readonly problems: readonly string[]
}

export function readBookmarkDir(dir: string): BookmarkDirRead {
  const names = readdirSync(dir).sort()
  const bookmarks = new Map<BookmarkId, Bookmark>()
  const files: { name: string; bytes: string }[] = []
  const problems: string[] = []
  for (const name of names) {
    const path = `${BOOKMARKS}/${name}`
    if (!FILE_PATTERN.test(name)) {
      problems.push(`${path} is not a bookmark file`)
      continue
    }
    const bytes = readFileSync(join(dir, name), "utf8")
    files.push({ name, bytes })
    let value: unknown
    try {
      value = JSON.parse(bytes)
    } catch (error) {
      const detail = error instanceof Error ? error.message : "invalid JSON"
      problems.push(`${path} is not valid JSON (${detail})`)
      continue
    }
    const parsed = parseBookmark(value)
    if (!parsed.ok) {
      problems.push(`${path} ${parsed.reason}`)
      continue
    }
    if (`${parsed.bookmark.id}.json` !== name) {
      problems.push(`${path} does not match id ${parsed.bookmark.id}`)
      continue
    }
    bookmarks.set(parsed.bookmark.id, parsed.bookmark)
  }
  for (const problem of duplicateSlugProblems(bookmarks)) problems.push(problem)
  return { bookmarks, files, problems }
}

export function canonicalProblems(
  files: readonly { readonly name: string; readonly bytes: string }[],
  bookmarks: Ledger,
): readonly string[] {
  const problems: string[] = []
  for (const file of files) {
    const match = FILE_PATTERN.exec(file.name)
    if (match === null) continue
    const id = match[1]
    if (id === undefined || !isBookmarkId(id)) continue
    const bookmark = bookmarks.get(id)
    if (bookmark === undefined) continue
    if (file.bytes !== canonicalBytes(bookmark)) problems.push(`${BOOKMARKS}/${file.name} is not canonical`)
  }
  return problems
}

export function identityProblems(bookmarks: Ledger, base: readonly Identity[]): readonly string[] {
  const problems: string[] = []
  const seen = new Set<BookmarkId>()
  for (const identity of base) {
    if (seen.has(identity.id)) {
      problems.push(`bookmark ${identity.id} is duplicated on the merge base`)
      continue
    }
    seen.add(identity.id)
    const current = bookmarks.get(identity.id)
    if (current === undefined) {
      problems.push(`bookmark ${identity.id} is missing`)
      continue
    }
    const field = changedField(current, identity)
    if (field !== undefined) problems.push(`bookmark ${identity.id} ${field} does not match the merge base`)
  }
  return problems
}

export function approvalProblems(bookmarks: Ledger, base: readonly BaseRecord[]): readonly string[] {
  const problems: string[] = []
  for (const record of base) {
    if (record.approval !== undefined) {
      const current = bookmarks.get(record.id)
      if (current === undefined) continue
      if (current.status.phase === "approved" && current.status.slug === record.approval) continue
      problems.push(`bookmark ${record.id} approval does not match the merge base`)
      continue
    }
    if (record.skip === undefined) continue
    const current = bookmarks.get(record.id)
    if (current === undefined) continue
    if (current.status.phase === "skipped" && current.status.reason === record.skip) continue
    problems.push(`bookmark ${record.id} skip does not match the merge base`)
  }
  return problems
}

export function storeProblem(repoRoot: string): string | undefined {
  const monolith = existsSync(join(repoRoot, MONOLITH))
  const bookmarks = existsSync(join(repoRoot, BOOKMARKS))
  if (monolith && bookmarks) {
    return "tracking/seen-bookmarks.json and tracking/bookmarks are both present"
  }
  if (monolith) return "tracking/seen-bookmarks.json is still in the tree"
  return undefined
}

function canonicalRecord(bookmark: Bookmark): {
  readonly id: string
  readonly title: string
  readonly url: string
  readonly date: string
  readonly status: Readonly<Record<string, string>>
} {
  return {
    id: bookmark.id,
    title: bookmark.title,
    url: bookmark.url,
    date: bookmark.date,
    status: canonicalStatus(bookmark.status),
  }
}

function canonicalStatus(status: BookmarkStatus): Readonly<Record<string, string>> {
  switch (status.phase) {
    case "proposed":
      return { phase: status.phase, at: status.at }
    case "approved":
      return { phase: status.phase, at: status.at, slug: status.slug }
    case "skipped":
      return { phase: status.phase, at: status.at, reason: status.reason }
    default: {
      const unreachable: never = status
      throw new Error(`unhandled status ${String(unreachable)}`)
    }
  }
}

function parseIdentity(value: Record<string, unknown>): { readonly ok: true; readonly identity: Identity } | Failure {
  const id = value.id
  const title = value.title
  const url = value.url
  const date = value.date
  if (typeof id !== "string" || !isBookmarkId(id)) return { ok: false, reason: "a bookmark record has no id" }
  if (typeof title !== "string" || title.length === 0) return { ok: false, reason: "a bookmark record has no title" }
  if (typeof url !== "string" || url.length === 0) return { ok: false, reason: "a bookmark record has no url" }
  if (typeof date !== "string" || date.length === 0) return { ok: false, reason: "a bookmark record has no date" }
  return { ok: true, identity: { id, title, url, date } }
}

function parseStatus(value: unknown): { readonly ok: true; readonly status: BookmarkStatus } | Failure {
  if (!isRecord(value) || typeof value.phase !== "string") {
    return { ok: false, reason: "a bookmark record has no status phase" }
  }
  const at = value.at
  if (typeof at !== "string" || at.length === 0) return { ok: false, reason: "a bookmark record has no status time" }
  switch (value.phase) {
    case "proposed":
      return { ok: true, status: { phase: "proposed", at } }
    case "approved": {
      const slug = value.slug
      if (typeof slug !== "string" || !isSlug(slug)) return { ok: false, reason: "an approved bookmark has no slug" }
      return { ok: true, status: { phase: "approved", at, slug } }
    }
    case "skipped": {
      const reason = value.reason
      if (typeof reason !== "string" || reason.length === 0) {
        return { ok: false, reason: "a skipped bookmark has no reason" }
      }
      return { ok: true, status: { phase: "skipped", at, reason } }
    }
    default:
      return { ok: false, reason: "a bookmark record has an unknown status phase" }
  }
}

function identitiesFromEntries(value: unknown, name: "proposed" | "approved" | "skipped"): IdentityRead {
  if (!Array.isArray(value)) return { ok: false, reason: `tracking/seen-bookmarks.json has no ${name} array` }
  const identities: BaseRecord[] = []
  for (const entry of value) {
    if (!isRecord(entry)) return { ok: false, reason: `a ${name} bookmark entry is not an object` }
    const identity = parseIdentity(entry)
    if (!identity.ok) return identity
    const terminal = terminalFromEntry(entry, name)
    if (!terminal.ok) return terminal
    identities.push({
      id: identity.identity.id,
      title: identity.identity.title,
      url: identity.identity.url,
      date: identity.identity.date,
      approval: terminal.approval,
      skip: terminal.skip,
    })
  }
  return { ok: true, identities }
}

function terminalFromEntry(
  entry: Record<string, unknown>,
  name: "proposed" | "approved" | "skipped",
): { readonly ok: true; readonly approval: Slug | undefined; readonly skip: string | undefined } | Failure {
  if (name === "approved") {
    const slug = entry.slug
    if (typeof slug !== "string" || !isSlug(slug)) return { ok: false, reason: "an approved bookmark has no slug" }
    return { ok: true, approval: slug, skip: undefined }
  }
  if (name === "skipped") {
    const reason = entry.reason
    if (typeof reason !== "string" || reason.length === 0) {
      return { ok: false, reason: "a skipped bookmark has no reason" }
    }
    return { ok: true, approval: undefined, skip: reason }
  }
  return { ok: true, approval: undefined, skip: undefined }
}

function duplicateSlugProblems(bookmarks: Ledger): readonly string[] {
  const seen = new Set<Slug>()
  const problems: string[] = []
  const records = [...bookmarks.values()].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
  for (const bookmark of records) {
    if (bookmark.status.phase !== "approved") continue
    if (seen.has(bookmark.status.slug)) {
      problems.push(`slug ${bookmark.status.slug} is already approved`)
      continue
    }
    seen.add(bookmark.status.slug)
  }
  return problems
}

function uniqueIdentities(identities: readonly BaseRecord[]): IdentityRead {
  const seen = new Set<BookmarkId>()
  for (const identity of identities) {
    if (seen.has(identity.id)) return { ok: false, reason: `bookmark ${identity.id} is duplicated on the merge base` }
    seen.add(identity.id)
  }
  return { ok: true, identities }
}

function approvedOwner(ledger: Ledger, slug: Slug): BookmarkId | undefined {
  for (const bookmark of ledger.values()) {
    if (bookmark.status.phase === "approved" && bookmark.status.slug === slug) return bookmark.id
  }
  return undefined
}

function changedField(current: Identity, next: Identity): "title" | "url" | "date" | undefined {
  if (current.title !== next.title) return "title"
  if (current.url !== next.url) return "url"
  if (current.date !== next.date) return "date"
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
