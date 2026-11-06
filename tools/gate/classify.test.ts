import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { expect, test } from "bun:test"
import { classifyDiff, decide } from "./classify.ts"
import { pathsFromNameStatus } from "./diff.ts"
import { runGate } from "./gate.ts"

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures")

function fixture(name: string): string[] {
  return readFileSync(join(fixtureDir, name), "utf8")
    .split("\n")
    .filter((line) => line.length > 0)
}

test("c27a1fcaeeae1d1e5461f1855a69d6ba7dfa8772 is historical scaffold and is not mergeable", () => {
  const paths = fixture("c27a1fcaeeae1d1e5461f1855a69d6ba7dfa8772.txt")
  const decision = decide(paths)
  expect(decision.kind).toBe("stop")
  if (decision.kind !== "stop") return
  expect(decision.lane).toBe("scaffold")
  expect(decision.message).toBe("the historical scaffold path set is not a mergeable pull request")
  expect(runGate({ repoRoot: ".", paths, base: "HEAD" }).code).toBe(1)
})

test("scaffold paths still match when the order changes", () => {
  const paths = fixture("c27a1fcaeeae1d1e5461f1855a69d6ba7dfa8772.txt").reverse()
  expect(classifyDiff(paths).lane).toBe("scaffold")
})

test("the scaffold set plus another file is not scaffold", () => {
  const paths = [...fixture("c27a1fcaeeae1d1e5461f1855a69d6ba7dfa8772.txt"), "LICENSE"]
  expect(classifyDiff(paths).lane).toBe("reject")
})

const scoutFixtures = [
  "9bbcb3f12495b94134c38817a711cfa163274841.txt",
  "d92da5c23b26e6d8f6df552aa1060d89713f3277.txt",
  "a931de845d0c4f40d7564b73fe0e7b8b97c212cf.txt",
]

for (const name of scoutFixtures) {
  test(`${name} classifies as scout`, () => {
    expect(decide(fixture(name)).kind).toBe("scout")
  })
}

const mixedFixtures = [
  "46e84aaeff240c0568f2bfd26632257a3d41f13e.txt",
  "8036236757a6db5866b6e2fb3c6aa568e3659266.txt",
]

for (const name of mixedFixtures) {
  test(`${name} rejects an app diff that also edits the ledger`, () => {
    const decision = decide(fixture(name))
    expect(decision.kind).toBe("stop")
    if (decision.kind !== "stop") return
    expect(decision.lane).toBe("reject")
    expect(decision.message).toBe("the diff edits an app and the bookmark ledger")
  })
}

test("apps/.gitkeep is not an app slug", () => {
  expect(classifyDiff(["apps/.gitkeep"]).lane).toBe("reject")
})

test("one slug is the app lane", () => {
  const classification = classifyDiff(["apps/deeptutor-demo/src/App.tsx"])
  expect(classification.lane).toBe("app")
  if (classification.lane !== "app") return
  expect(classification.slug).toBe("deeptutor-demo")
})

test("a slug without a hyphen is rejected", () => {
  expect(classifyDiff(["apps/deeptutor/src/App.tsx"]).lane).toBe("reject")
})

test("two app slugs are rejected", () => {
  const decision = decide([
    "apps/deeptutor-demo/src/App.tsx",
    "apps/geoinflow-demo/src/App.tsx",
  ])
  expect(decision.kind).toBe("stop")
  if (decision.kind !== "stop") return
  expect(decision.message).toBe("the diff touches more than one app")
})

test("repo paths stay in the repo lane", () => {
  expect(
    decide([
      ".github/workflows/gate.yml",
      "tools/gate/cli.ts",
      "skills/project-planning/SKILL.md",
      "AGENTS.md",
      "README.md",
      "LICENSE",
    ]).kind,
  ).toBe("repo")
})

test("a path outside the repo lane is rejected", () => {
  expect(classifyDiff(["tools/other/note.ts"]).lane).toBe("reject")
  expect(classifyDiff(["LICENSE.txt"]).lane).toBe("reject")
  expect(classifyDiff([]).lane).toBe("reject")
  expect(classifyDiff(["../secret"]).lane).toBe("reject")
})

test("backslashes normalize before classification", () => {
  expect(classifyDiff(["apps\\deeptutor-demo\\src\\App.tsx"]).lane).toBe("app")
})

test("a rename keeps both paths", () => {
  expect(
    pathsFromNameStatus(
      "M\0AGENTS.md\0R100\0tracking/seen-bookmarks.json\0apps/deeptutor-demo/src/App.tsx\0",
    ),
  ).toEqual(["AGENTS.md", "tracking/seen-bookmarks.json", "apps/deeptutor-demo/src/App.tsx"])
})
