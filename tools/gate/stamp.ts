import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { isRecord } from "./guard.ts"
import { parseJsonc, writeJson } from "./jsonc.ts"
import {
  APP_CONFIG,
  ROOT_DIR,
  SOLUTION_CONFIG,
  TEST_CONFIG,
  TEST_GLOB,
} from "./predicate.ts"

export function stampApp(appDir: string): readonly string[] {
  const appPath = join(appDir, APP_CONFIG)
  if (!existsSync(appPath)) return [`${APP_CONFIG} is missing`]
  let appJson: unknown
  try {
    appJson = parseJsonc(readFileSync(appPath, "utf8"))
  } catch (error) {
    return [readProblem(APP_CONFIG, error)]
  }
  if (!isRecord(appJson)) return [`${APP_CONFIG} is not an object`]

  const options: Record<string, unknown> = isRecord(appJson.compilerOptions)
    ? { ...appJson.compilerOptions }
    : {}
  options.strict = true
  delete options.baseUrl
  options.rootDir = ROOT_DIR
  const exclude = Array.isArray(appJson.exclude)
    ? appJson.exclude.filter((item): item is string => typeof item === "string")
    : []
  if (!exclude.includes(TEST_GLOB)) exclude.push(TEST_GLOB)

  const solutionPath = join(appDir, SOLUTION_CONFIG)
  let solution: Record<string, unknown> | undefined
  if (existsSync(solutionPath)) {
    let parsed: unknown
    try {
      parsed = parseJsonc(readFileSync(solutionPath, "utf8"))
    } catch (error) {
      return [readProblem(SOLUTION_CONFIG, error)]
    }
    if (!isRecord(parsed)) return [`${SOLUTION_CONFIG} is not an object`]
    solution = parsed
    if (Array.isArray(solution.references)) {
      solution.references = solution.references.filter((reference) => {
        if (!isRecord(reference) || typeof reference.path !== "string") return true
        return !reference.path.endsWith(TEST_CONFIG)
      })
    }
  }

  writeJson(appPath, { ...appJson, compilerOptions: options, exclude })
  writeJson(join(appDir, TEST_CONFIG), {
    extends: "./tsconfig.app.json",
    compilerOptions: {
      types: ["bun-types"],
      rootDir: ROOT_DIR,
      noEmit: true,
    },
    include: [TEST_GLOB],
    exclude: [],
  })
  if (solution !== undefined) writeJson(solutionPath, solution)
  return []
}

function readProblem(name: string, error: unknown): string {
  const detail = error instanceof Error ? error.message : "invalid JSON"
  return `${name} is not valid JSON (${detail})`
}
