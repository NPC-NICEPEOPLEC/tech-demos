import { gitShow, listFiles } from "./diff.ts"
import { isRecord } from "./guard.ts"
import { parseJsonc } from "./jsonc.ts"
import { isSlug, type Slug } from "./classify.ts"

const MONOLITH = "tracking/seen-bookmarks.json"
const BOOKMARKS = "tracking/bookmarks"

export type LedgerRead =
  | { readonly ok: true; readonly slugs: ReadonlySet<Slug> }
  | { readonly ok: false; readonly reason: string }

export function loadApprovedSlugs(repoRoot: string, base: string): LedgerRead {
  let monolith: unknown | undefined
  const monolithText = gitShow(repoRoot, base, MONOLITH)
  if (monolithText !== undefined) {
    try {
      monolith = parseJsonc(monolithText)
    } catch (error) {
      const detail = error instanceof Error ? error.message : "invalid JSON"
      return { ok: false, reason: `${MONOLITH} is not valid JSON (${detail})` }
    }
  }

  const bookmarkPaths = listFiles(repoRoot, base, BOOKMARKS).filter((path) => path.endsWith(".json"))
  let bookmarks: unknown[] | undefined
  if (bookmarkPaths.length > 0) {
    bookmarks = []
    for (const path of bookmarkPaths) {
      const text = gitShow(repoRoot, base, path)
      if (text === undefined) return { ok: false, reason: `${path} is missing at ${base}` }
      try {
        bookmarks.push(parseJsonc(text))
      } catch (error) {
        const detail = error instanceof Error ? error.message : "invalid JSON"
        return { ok: false, reason: `${path} is not valid JSON (${detail})` }
      }
    }
  }

  return approvedSlugsFromLedger({ monolith, bookmarks })
}

export function approvedSlugsFromLedger(input: {
  readonly monolith: unknown | undefined
  readonly bookmarks: readonly unknown[] | undefined
}): LedgerRead {
  const hasMonolith = input.monolith !== undefined
  const hasBookmarks = input.bookmarks !== undefined && input.bookmarks.length > 0
  if (hasMonolith && hasBookmarks) {
    return {
      ok: false,
      reason: "the merge base has tracking/seen-bookmarks.json and tracking/bookmarks together",
    }
  }
  if (hasMonolith) return slugsFromMonolith(input.monolith)
  if (input.bookmarks !== undefined && input.bookmarks.length > 0) return slugsFromBookmarks(input.bookmarks)
  return { ok: true, slugs: new Set() }
}

function slugsFromMonolith(value: unknown): LedgerRead {
  if (!isRecord(value) || !Array.isArray(value.approved)) {
    return { ok: false, reason: "tracking/seen-bookmarks.json has no approved array" }
  }
  const slugs = new Set<Slug>()
  for (const entry of value.approved) {
    if (!isRecord(entry) || typeof entry.slug !== "string" || !isSlug(entry.slug)) {
      return { ok: false, reason: "an approved bookmark has no slug" }
    }
    slugs.add(entry.slug)
  }
  return { ok: true, slugs }
}

function slugsFromBookmarks(records: readonly unknown[]): LedgerRead {
  const slugs = new Set<Slug>()
  for (const record of records) {
    const read = slugFromBookmark(record)
    if (!read.ok) return read
    if (read.slug !== undefined) slugs.add(read.slug)
  }
  return { ok: true, slugs }
}

function slugFromBookmark(
  value: unknown,
): { readonly ok: true; readonly slug: Slug | undefined } | { readonly ok: false; readonly reason: string } {
  if (!isRecord(value) || !isRecord(value.status) || typeof value.status.phase !== "string") {
    return { ok: false, reason: "a bookmark record has no status phase" }
  }
  const phase = value.status.phase
  if (phase === "proposed" || phase === "skipped") return { ok: true, slug: undefined }
  if (phase === "approved") {
    const slug = value.status.slug
    if (typeof slug !== "string" || !isSlug(slug)) {
      return { ok: false, reason: "an approved bookmark has no slug" }
    }
    return { ok: true, slug }
  }
  return { ok: false, reason: "a bookmark record has an unknown status phase" }
}
