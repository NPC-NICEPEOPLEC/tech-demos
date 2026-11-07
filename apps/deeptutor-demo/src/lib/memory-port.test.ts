import { describe, expect, test } from "bun:test"
import { createMemoryPort, MEMORY_KEY, type StorageLike } from "./memory-port"

const V1_KEY = "deeptutor.memory.v1"

function fakeStorage(seed: Record<string, string> = {}): StorageLike & {
  raw(key?: string): string | null
  writes(): number
} {
  const items = new Map(Object.entries(seed))
  let writeCount = 0
  return {
    getItem(key) {
      return items.get(key) ?? null
    },
    setItem(key, value) {
      writeCount += 1
      items.set(key, value)
    },
    removeItem(key) {
      writeCount += 1
      items.delete(key)
    },
    raw(key = MEMORY_KEY) {
      return items.get(key) ?? null
    },
    writes() {
      return writeCount
    },
  }
}

function document(topics: unknown, longTerm: unknown = { quizzes: 1, answered: 1, correct: 0 }): string {
  return JSON.stringify({
    session: { answered: 1, correct: 0, total: 1 },
    topics,
    longTerm,
  })
}

describe("memory port", () => {
  test("writes topics as an array and reads constructor and __proto__ back", () => {
    const storage = fakeStorage()
    const port = createMemoryPort(storage)
    port.write({
      session: { answered: 1, correct: 0, total: 1 },
      topics: new Map([
        ["constructor", { seen: 1, correct: 0 }],
        ["__proto__", { seen: 2, correct: 2 }],
      ]),
      longTerm: { quizzes: 1, answered: 1, correct: 0 },
    })

    expect(JSON.parse(storage.raw() ?? "")).toEqual({
      session: { answered: 1, correct: 0, total: 1 },
      topics: [
        { topic: "__proto__", seen: 2, correct: 2 },
        { topic: "constructor", seen: 1, correct: 0 },
      ],
      longTerm: { quizzes: 1, answered: 1, correct: 0 },
    })
    const read = port.read()
    expect(read.topics.get("constructor")).toEqual({ seen: 1, correct: 0 })
    expect(read.topics.get("__proto__")).toEqual({ seen: 2, correct: 2 })
  })

  test("a v1 document parses as empty and is not written back", () => {
    const raw = JSON.stringify({
      session: { answered: 1, correct: 0, total: 4 },
      topics: { constructor: { seen: null, correct: null } },
      longTerm: { quizzes: 1, answered: 1, correct: 0, weakSpots: ["constructor"] },
    })
    const oldKey = fakeStorage({ [V1_KEY]: raw })
    expect(createMemoryPort(oldKey).read().longTerm.quizzes).toBe(0)
    expect(oldKey.writes()).toBe(0)
    expect(oldKey.raw(V1_KEY)).toBe(raw)
    expect(oldKey.raw()).toBeNull()

    const newKey = fakeStorage({ [MEMORY_KEY]: raw })
    expect(createMemoryPort(newKey).read().topics.size).toBe(0)
    expect(newKey.writes()).toBe(0)
    expect(newKey.raw()).toBe(raw)
  })

  test("a string seen parses as empty and is not written back", () => {
    const raw = document([{ topic: "Light reactions", seen: "nope", correct: 0 }])
    const storage = fakeStorage({ [MEMORY_KEY]: raw })
    const read = createMemoryPort(storage).read()

    expect(read.topics.size).toBe(0)
    expect(read.session.answered).toBe(0)
    expect(storage.writes()).toBe(0)
    expect(storage.raw()).toBe(raw)
  })

  test("a null count or a count that is not an integer >= 0 parses as empty", () => {
    const samples = [
      document([{ topic: "constructor", seen: null, correct: null }]),
      document([{ topic: "constructor", seen: 1.5, correct: 0 }]),
      document([{ topic: "constructor", seen: -1, correct: 0 }]),
      document([{ topic: "constructor", seen: 1, correct: 0 }], {
        quizzes: 1.2,
        answered: 1,
        correct: 0,
      }),
      document(
        [{ topic: "constructor", seen: 1, correct: 0 }],
        { quizzes: 1, answered: 1, correct: 0, weakSpots: ["constructor"] },
      ),
    ]

    for (const raw of samples) {
      const storage = fakeStorage({ [MEMORY_KEY]: raw })
      expect(createMemoryPort(storage).read().topics.size).toBe(0)
      expect(storage.writes()).toBe(0)
      expect(storage.raw()).toBe(raw)
    }
  })

  test("invalid JSON parses as empty and is not written back", () => {
    const storage = fakeStorage({ [MEMORY_KEY]: "{" })
    expect(createMemoryPort(storage).read().longTerm.quizzes).toBe(0)
    expect(storage.writes()).toBe(0)
    expect(storage.raw()).toBe("{")
  })

  test("a storage read failure parses as empty", () => {
    const storage = fakeStorage({ [MEMORY_KEY]: "{}" })
    storage.getItem = () => {
      throw new Error("denied")
    }
    expect(createMemoryPort(storage).read().topics.size).toBe(0)
    expect(storage.writes()).toBe(0)
  })
})
