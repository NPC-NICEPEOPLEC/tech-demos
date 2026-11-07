export type Slug = string & { readonly __brand: "Slug" }

const SLUG_PATTERN = /^[a-z][a-z0-9]+(?:-[a-z0-9]+)+$/

const SCAFFOLD_PATHS: readonly string[] = [
  "AGENTS.md",
  "README.md",
  "apps/.gitkeep",
  "skills/project-planning/SKILL.md",
  "tracking/seen-bookmarks.json",
]

const REPO_FILES = new Set(["AGENTS.md", "README.md", "LICENSE"])

export function isSlug(value: string): value is Slug {
  return SLUG_PATTERN.test(value)
}

export type Classification =
  | { readonly lane: "scaffold" }
  | { readonly lane: "app"; readonly slug: Slug }
  | { readonly lane: "scout" }
  | { readonly lane: "repo" }
  | { readonly lane: "reject"; readonly reason: string }

export type Decision =
  | { readonly kind: "stop"; readonly lane: "scaffold"; readonly message: string }
  | { readonly kind: "stop"; readonly lane: "reject"; readonly message: string }
  | { readonly kind: "repo" }
  | { readonly kind: "scout" }
  | { readonly kind: "app"; readonly slug: Slug }

export function classifyDiff(paths: readonly string[]): Classification {
  const normalized = unique(paths.map(normalizePath))
  if (normalized.length === 0) {
    return { lane: "reject", reason: "the diff has no paths" }
  }
  if (normalized.some(isUnsafePath)) {
    return { lane: "reject", reason: "a path escapes the repository" }
  }
  if (samePaths(normalized, SCAFFOLD_PATHS)) {
    return { lane: "scaffold" }
  }
  if (normalized.every((path) => path.startsWith("tracking/"))) {
    return { lane: "scout" }
  }
  if (normalized.every(isRepoPath)) {
    return { lane: "repo" }
  }

  const slugs = new Set<Slug>()
  let sawNonApp = false
  for (const path of normalized) {
    const slug = slugFromAppPath(path)
    if (slug === undefined) sawNonApp = true
    else slugs.add(slug)
  }
  if (!sawNonApp && slugs.size === 1) {
    const slug = only(slugs)
    if (slug !== undefined) return { lane: "app", slug }
  }
  if (slugs.size > 1) {
    return { lane: "reject", reason: "the diff touches more than one app" }
  }
  if (slugs.size === 1 && normalized.some((path) => path.startsWith("tracking/"))) {
    return { lane: "reject", reason: "the diff edits an app and the bookmark ledger" }
  }
  return { lane: "reject", reason: "the diff is not one lane" }
}

export function decide(paths: readonly string[]): Decision {
  const classification = classifyDiff(paths)
  switch (classification.lane) {
    case "scaffold":
      return {
        kind: "stop",
        lane: "scaffold",
        message: "the historical scaffold path set is not a mergeable pull request",
      }
    case "reject":
      return { kind: "stop", lane: "reject", message: classification.reason }
    case "repo":
      return { kind: "repo" }
    case "scout":
      return { kind: "scout" }
    case "app":
      return { kind: "app", slug: classification.slug }
    default: {
      const unreachable: never = classification
      throw new Error(`unhandled lane ${String(unreachable)}`)
    }
  }
}

function slugFromAppPath(path: string): Slug | undefined {
  const parts = path.split("/")
  if (parts.length < 3 || parts[0] !== "apps") return undefined
  const slug = parts[1]
  if (slug === undefined || !isSlug(slug)) return undefined
  return slug
}

function isRepoPath(path: string): boolean {
  return (
    path.startsWith(".github/") ||
    path.startsWith("tools/gate/") ||
    path.startsWith("skills/") ||
    REPO_FILES.has(path)
  )
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "")
}

function isUnsafePath(path: string): boolean {
  return path.length === 0 || path.startsWith("/") || path.split("/").includes("..")
}

function samePaths(paths: readonly string[], expected: readonly string[]): boolean {
  if (paths.length !== expected.length) return false
  const got = new Set(paths)
  if (got.size !== expected.length) return false
  return expected.every((path) => got.has(path))
}

function unique(paths: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const path of paths) {
    if (seen.has(path)) continue
    seen.add(path)
    out.push(path)
  }
  return out
}

function only(slugs: ReadonlySet<Slug>): Slug | undefined {
  if (slugs.size !== 1) return undefined
  for (const slug of slugs) return slug
  return undefined
}
