import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { changedPaths, gitRoot, resolveMergeBase } from "./diff.ts"
import { runGate } from "./gate.ts"
import { stampApp } from "./stamp.ts"

function main(): number {
  const repoRoot = gitRoot()
  const args = process.argv.slice(2)
  if (args[0] === "stamp") {
    const dir = args[1]
    if (dir === undefined || args.length !== 2) {
      process.stderr.write("usage: bun tools/gate/cli.ts stamp <app-dir>\n")
      return 1
    }
    const problems = stampApp(resolve(repoRoot, dir))
    if (problems.length > 0) {
      process.stderr.write(`${problems.join("\n")}\n`)
      return 1
    }
    process.stdout.write(`stamped ${dir}\n`)
    return 0
  }
  if (args.length !== 0) {
    process.stderr.write("usage: bun tools/gate/cli.ts\n")
    return 1
  }
  const base = resolveMergeBase(repoRoot)
  const paths = changedPaths(repoRoot, base)
  const result = runGate({ repoRoot, paths, base })
  const stream = result.code === 0 ? process.stdout : process.stderr
  stream.write(`${result.message}\n`)
  return result.code
}

function isDirectRun(): boolean {
  if (import.meta.main === true) return true
  const entry = process.argv[1]
  if (entry === undefined) return false
  return import.meta.url === pathToFileURL(resolve(entry)).href
}

if (isDirectRun()) {
  try {
    process.exit(main())
  } catch (error) {
    const message = error instanceof Error ? error.message : "the gate failed"
    process.stderr.write(`${message}\n`)
    process.exit(1)
  }
}
