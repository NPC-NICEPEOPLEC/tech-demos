import { spawnSync } from "node:child_process"

type GitResult = { readonly code: number; readonly stdout: string; readonly stderr: string }

export function gitRoot(cwd = process.cwd()): string {
  const result = runGit(cwd, ["rev-parse", "--show-toplevel"])
  if (result.code !== 0) {
    throw new Error(result.stderr || "git rev-parse --show-toplevel failed")
  }
  return result.stdout.trim()
}

export function resolveMergeBase(repoRoot: string): string {
  const explicit = process.env.GATE_BASE
  if (explicit !== undefined && explicit.length > 0) return explicit
  const baseRef = process.env.GATE_BASE_REF ?? process.env.GITHUB_BASE_REF
  const target = baseRef !== undefined && baseRef.length > 0 ? `origin/${baseRef}` : "origin/main"
  const result = runGit(repoRoot, ["merge-base", "HEAD", target])
  if (result.code !== 0) {
    throw new Error(result.stderr || `git merge-base HEAD ${target} failed`)
  }
  return result.stdout.trim()
}

export function changedPaths(repoRoot: string, base: string): readonly string[] {
  const result = runGit(repoRoot, [
    "diff",
    "-z",
    "--name-status",
    "--find-renames",
    `${base}...HEAD`,
  ])
  if (result.code !== 0) throw new Error(result.stderr || "git diff failed")
  return pathsFromNameStatus(result.stdout)
}

export function pathsFromNameStatus(text: string): readonly string[] {
  const records = text.split("\0").filter((part) => part.length > 0)
  const paths: string[] = []
  let index = 0
  while (index < records.length) {
    const status = records[index]
    if (status === undefined) break
    if (status.startsWith("R") || status.startsWith("C")) {
      pushPath(paths, records[index + 1])
      pushPath(paths, records[index + 2])
      index += 3
      continue
    }
    pushPath(paths, records[index + 1])
    index += 2
  }
  return paths
}

export function gitShow(repoRoot: string, base: string, path: string): string | undefined {
  const result = runGit(repoRoot, ["show", `${base}:${path}`])
  if (result.code === 0) return result.stdout
  if (result.stderr.includes("does not exist") || result.stderr.includes("exists on disk, but not in")) {
    return undefined
  }
  throw new Error(result.stderr || `git show ${base}:${path} failed`)
}

export function listFiles(repoRoot: string, base: string, prefix: string): readonly string[] {
  const result = runGit(repoRoot, ["ls-tree", "-r", "--name-only", base, prefix])
  if (result.code !== 0) {
    throw new Error(result.stderr || `git ls-tree ${base} ${prefix} failed`)
  }
  return result.stdout.split("\n").filter((line) => line.length > 0)
}

function runGit(repoRoot: string, args: readonly string[]): GitResult {
  const result = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" })
  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: (result.stderr ?? "").trim() || result.error?.message || "",
  }
}

function pushPath(paths: string[], path: string | undefined): void {
  if (path === undefined || path.length === 0) return
  paths.push(path)
}
