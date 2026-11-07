import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { decide, type Slug } from "./classify.ts"
import { loadApprovedSlugs } from "./ledger.ts"
import { checkApp } from "./predicate.ts"

export type StepResult = { readonly code: number; readonly message: string }

const MONOLITH = "tracking/seen-bookmarks.json"
const LEDGER_CLI = "tracking/cli.ts"

export function runGate(input: {
  readonly repoRoot: string
  readonly paths: readonly string[]
  readonly base: string
}): StepResult {
  const decision = decide(input.paths)
  switch (decision.kind) {
    case "stop":
      return { code: 1, message: decision.message }
    case "repo":
      return runCommandResult(input.repoRoot, "bun", ["test", "tools/gate"], "repo lane")
    case "scout":
      return runScout(input.repoRoot)
    case "app":
      return runApp(input.repoRoot, input.base, decision.slug)
    default: {
      const unreachable: never = decision
      throw new Error(`unhandled decision ${String(unreachable)}`)
    }
  }
}

export function runScout(repoRoot: string): StepResult {
  if (existsSync(join(repoRoot, MONOLITH))) {
    return {
      code: 1,
      message: "tracking/seen-bookmarks.json is still in the tree, so this scout diff is not mergeable",
    }
  }
  if (!existsSync(join(repoRoot, LEDGER_CLI))) {
    return {
      code: 1,
      message: "a scout diff runs bun tracking/cli.ts check, and that file is not in this tree",
    }
  }
  return runCommandResult(repoRoot, "bun", ["tracking/cli.ts", "check"], "scout lane")
}

function runApp(repoRoot: string, base: string, slug: Slug): StepResult {
  const ledger = loadApprovedSlugs(repoRoot, base)
  if (!ledger.ok) return { code: 1, message: ledger.reason }
  if (!ledger.slugs.has(slug)) {
    return { code: 1, message: `slug ${slug} is not approved on the merge-base ledger` }
  }
  const appDir = join(repoRoot, "apps", slug)
  const problems = checkApp(appDir)
  if (problems.length > 0) return { code: 1, message: problems.join("\n") }
  const steps: readonly (readonly [string, readonly string[]])[] = [
    ["bun", ["install"]],
    ["bun", ["test"]],
    ["bunx", ["tsc", "-p", "tsconfig.test.json", "--noEmit"]],
    ["bun", ["run", "lint"]],
    ["bun", ["run", "build"]],
  ]
  for (const [command, args] of steps) {
    const code = spawnCode(command, args, appDir)
    if (code !== 0) return { code, message: `${command} ${args.join(" ")} failed in apps/${slug}` }
  }
  return { code: 0, message: `app lane passed for ${slug}` }
}

function runCommandResult(
  cwd: string,
  command: string,
  args: readonly string[],
  lane: string,
): StepResult {
  const code = spawnCode(command, args, cwd)
  if (code !== 0) return { code, message: `${lane} failed` }
  return { code: 0, message: `${lane} passed` }
}

function spawnCode(command: string, args: readonly string[], cwd: string): number {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" })
  return result.status ?? 1
}
