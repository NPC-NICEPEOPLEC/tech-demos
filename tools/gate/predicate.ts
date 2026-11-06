import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { isRecord } from "./guard.ts"
import { parseJsonc } from "./jsonc.ts"

export const TEST_GLOB = "src/**/*.test.ts"
export const ROOT_DIR = "src"
export const STYLE = "base-lyra"
export const APP_CONFIG = "tsconfig.app.json"
export const TEST_CONFIG = "tsconfig.test.json"
export const SOLUTION_CONFIG = "tsconfig.json"
export const COMPONENTS = "components.json"

export function checkApp(appDir: string): readonly string[] {
  return [
    ...checkAppConfig(appDir),
    ...checkTestConfig(appDir),
    ...checkSolution(appDir),
    ...checkStyle(appDir),
  ]
}

function checkAppConfig(appDir: string): readonly string[] {
  const read = readConfig(appDir, APP_CONFIG)
  if (!read.ok) return [read.problem]
  if (!isRecord(read.value)) return [`${APP_CONFIG} is not an object`]
  const options = read.value.compilerOptions
  if (!isRecord(options)) return [`${APP_CONFIG} has no compilerOptions object`]
  const problems: string[] = []
  if (options.strict !== true) problems.push(`${APP_CONFIG} must set strict to true`)
  if ("baseUrl" in options) problems.push(`${APP_CONFIG} must not set baseUrl`)
  if (options.rootDir !== ROOT_DIR) problems.push(`${APP_CONFIG} must set rootDir to ${ROOT_DIR}`)
  const exclude = read.value.exclude
  if (!Array.isArray(exclude) || !exclude.includes(TEST_GLOB)) {
    problems.push(`${APP_CONFIG} exclude must include ${TEST_GLOB}`)
  }
  return problems
}

function checkTestConfig(appDir: string): readonly string[] {
  const read = readConfig(appDir, TEST_CONFIG)
  if (!read.ok) return [read.problem]
  if (!isRecord(read.value)) return [`${TEST_CONFIG} is not an object`]
  const problems: string[] = []
  if (read.value.extends !== "./tsconfig.app.json") {
    problems.push(`${TEST_CONFIG} must extend ./tsconfig.app.json`)
  }
  const options = read.value.compilerOptions
  if (!isRecord(options)) {
    problems.push(`${TEST_CONFIG} has no compilerOptions object`)
    return problems
  }
  const types = options.types
  if (!Array.isArray(types) || !types.includes("bun-types")) {
    problems.push(`${TEST_CONFIG} types must include bun-types`)
  }
  if (options.rootDir !== ROOT_DIR) problems.push(`${TEST_CONFIG} must set rootDir to ${ROOT_DIR}`)
  const include = read.value.include
  if (!Array.isArray(include) || !include.includes(TEST_GLOB)) {
    problems.push(`${TEST_CONFIG} include must include ${TEST_GLOB}`)
  }
  const exclude = read.value.exclude
  if (!Array.isArray(exclude) || exclude.length !== 0) {
    problems.push(`${TEST_CONFIG} exclude must be empty`)
  }
  return problems
}

function checkSolution(appDir: string): readonly string[] {
  const path = join(appDir, SOLUTION_CONFIG)
  if (!existsSync(path)) return []
  const read = readConfig(appDir, SOLUTION_CONFIG)
  if (!read.ok) return [read.problem]
  if (!isRecord(read.value)) return [`${SOLUTION_CONFIG} is not an object`]
  const references = read.value.references
  if (references === undefined) return []
  if (!Array.isArray(references)) return [`${SOLUTION_CONFIG} references is not an array`]
  for (const reference of references) {
    if (!isRecord(reference) || typeof reference.path !== "string") continue
    if (reference.path.endsWith(TEST_CONFIG)) {
      return [`${SOLUTION_CONFIG} must not reference ${TEST_CONFIG}`]
    }
  }
  return []
}

function checkStyle(appDir: string): readonly string[] {
  const read = readConfig(appDir, COMPONENTS)
  if (!read.ok) return [read.problem]
  if (!isRecord(read.value) || read.value.style !== STYLE) {
    return [`${COMPONENTS} style must be ${STYLE}`]
  }
  return []
}

function readConfig(
  appDir: string,
  name: string,
): { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly problem: string } {
  const path = join(appDir, name)
  if (!existsSync(path)) return { ok: false, problem: `${name} is missing` }
  try {
    return { ok: true, value: parseJsonc(readFileSync(path, "utf8")) }
  } catch (error) {
    const detail = error instanceof Error ? error.message : "invalid JSON"
    return { ok: false, problem: `${name} is not valid JSON (${detail})` }
  }
}
