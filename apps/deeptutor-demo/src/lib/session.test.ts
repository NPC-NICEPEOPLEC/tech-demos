import { describe, expect, test } from "bun:test"
import { MEMORY_KEY, type StorageLike } from "./memory-port"
import { createBrowserQuiz, weakTopics } from "./session"

function question(topic: string, answer: string) {
  return {
    id: topic,
    topic,
    prompt: `Which choice fits ${topic}?`,
    choices: [answer, "other"],
    answer,
    explanation: `Notes name ${answer}.`,
  }
}

function fakeStorage(seed: Record<string, string> = {}): StorageLike & {
  raw(): string | null
} {
  const items = new Map(Object.entries(seed))
  return {
    getItem(key) {
      return items.get(key) ?? null
    },
    setItem(key, value) {
      items.set(key, value)
    },
    removeItem(key) {
      items.delete(key)
    },
    raw() {
      return items.get(MEMORY_KEY) ?? null
    },
  }
}

function localWriters(questions = [question("Light reactions", "oxygen")]) {
  return {
    writeQuiz: () => questions,
    modelQuiz: async () => [],
    modelKey: () => null as string | null,
  }
}

describe("quiz session", () => {
  test("topics named constructor and __proto__ stay counts", async () => {
    const storage = fakeStorage()
    const quiz = createBrowserQuiz(
      { localStorage: storage },
      localWriters([question("constructor", "own"), question("__proto__", "own")]),
    )

    await quiz.generate("notes", false)
    quiz.choose("other")
    quiz.go(1)
    quiz.choose("own")

    expect(quiz.snapshot().memory.topics).toEqual([
      { topic: "__proto__", seen: 1, correct: 1 },
      { topic: "constructor", seen: 1, correct: 0 },
    ])
    expect(JSON.parse(storage.raw() ?? "null")).toMatchObject({
      topics: [
        { topic: "__proto__", seen: 1, correct: 1 },
        { topic: "constructor", seen: 1, correct: 0 },
      ],
    })

    const reloaded = createBrowserQuiz({ localStorage: storage }, localWriters([]))
    expect(reloaded.snapshot().memory.topics).toEqual(quiz.snapshot().memory.topics)
  })

  test("a string seen parses as empty and is not written back", () => {
    const raw = JSON.stringify({
      session: { answered: 2, correct: 1, total: 4 },
      topics: [{ topic: "Light reactions", seen: "nope", correct: 1 }],
      longTerm: { quizzes: 1, answered: 2, correct: 1 },
    })
    let writes = 0
    let stored: string | null = raw
    const storage: StorageLike = {
      getItem(key) {
        return key === MEMORY_KEY ? stored : null
      },
      setItem(key, value) {
        writes += 1
        if (key === MEMORY_KEY) stored = value
      },
      removeItem(key) {
        writes += 1
        if (key === MEMORY_KEY) stored = null
      },
    }

    const quiz = createBrowserQuiz({ localStorage: storage }, localWriters())
    expect(quiz.snapshot().memory.topics).toEqual([])
    expect(quiz.snapshot().memory.longTerm.quizzes).toBe(0)
    expect(writes).toBe(0)
    expect(stored).toBe(raw)
  })

  test("a throwing setItem leaves the previous snapshot", async () => {
    let fail = false
    const items = new Map<string, string>()
    const storage: StorageLike & { raw(): string | null } = {
      getItem(key) {
        return items.get(key) ?? null
      },
      setItem(key, value) {
        if (fail) throw new Error("quota")
        items.set(key, value)
      },
      removeItem(key) {
        items.delete(key)
      },
      raw() {
        return items.get(MEMORY_KEY) ?? null
      },
    }
    const quiz = createBrowserQuiz({ localStorage: storage }, localWriters())
    const initial = quiz.snapshot()

    fail = true
    await quiz.generate("notes", false)
    expect(quiz.snapshot()).toBe(initial)
    expect(storage.raw()).toBeNull()

    fail = false
    await quiz.generate("notes", false)
    const opened = quiz.snapshot()
    const stored = storage.raw()
    fail = true
    quiz.choose("other")
    expect(quiz.snapshot()).toBe(opened)
    expect(storage.raw()).toBe(stored)
    expect(opened.memory.topics).toEqual([])
  })

  test("a throwing setItem after the model returns keeps the scores and clears busy", async () => {
    let fail = false
    const items = new Map<string, string>()
    const storage: StorageLike = {
      getItem(key) {
        return items.get(key) ?? null
      },
      setItem(key, value) {
        if (fail) throw new Error("quota")
        items.set(key, value)
      },
      removeItem(key) {
        items.delete(key)
      },
    }
    const quiz = createBrowserQuiz(
      { localStorage: storage },
      {
        writeQuiz: () => [question("local", "keep")],
        modelQuiz: async () => [
          question("model-a", "a"),
          question("model-b", "b"),
          question("model-c", "c"),
        ],
        modelKey: () => "key",
      },
    )

    await quiz.generate("notes", false)
    quiz.choose("other")
    const before = quiz.snapshot()
    const stored = items.get(MEMORY_KEY)
    fail = true
    await quiz.generate("notes", true)

    const after = quiz.snapshot()
    expect(after.busy).toBe(false)
    expect(after.questions).toEqual(before.questions)
    expect(after.memory).toEqual(before.memory)
    expect(after.message).toBe("Could not save this quiz on this browser.")
    expect(items.get(MEMORY_KEY)).toBe(stored)
  })

  test("setItem runs before the snapshot changes", async () => {
    const storage = fakeStorage()
    const quiz = createBrowserQuiz({ localStorage: storage }, localWriters())
    await quiz.generate("notes", false)
    const before = quiz.snapshot()
    const write = storage.setItem.bind(storage)
    let sawPrevious = false
    storage.setItem = (key, value) => {
      sawPrevious = quiz.snapshot() === before
      write(key, value)
    }

    quiz.choose("oxygen")
    expect(sawPrevious).toBe(true)
    expect(quiz.snapshot()).not.toBe(before)
    expect(quiz.snapshot().memory.topics).toEqual([
      { topic: "Light reactions", seen: 1, correct: 1 },
    ])
  })

  test("reset during generate drops the quiz that lost", async () => {
    let finish: (questions: ReturnType<typeof question>[]) => void = () => {}
    const model = new Promise<ReturnType<typeof question>[]>((resolve) => {
      finish = resolve
    })
    const storage = fakeStorage()
    const quiz = createBrowserQuiz(
      { localStorage: storage },
      {
        writeQuiz: () => [question("local", "keep")],
        modelQuiz: () => model,
        modelKey: () => "key",
      },
    )

    const pending = quiz.generate("study notes", true)
    expect(quiz.snapshot().busy).toBe(true)
    quiz.reset()
    finish([question("model-a", "a"), question("model-b", "b"), question("model-c", "c")])
    await pending

    expect(quiz.snapshot().memory.longTerm.quizzes).toBe(0)
    expect(quiz.snapshot().questions).toEqual([])
    expect(quiz.snapshot().busy).toBe(false)
    expect(storage.raw()).toBeNull()

    await quiz.generate("study notes", false)
    expect(quiz.snapshot().memory.longTerm.quizzes).toBe(1)
    expect(quiz.snapshot().questions.map((item) => item.topic)).toEqual(["local"])
  })

  test("the next quiz keeps topic counts", async () => {
    const quiz = createBrowserQuiz(
      { localStorage: fakeStorage() },
      localWriters([question("Light reactions", "oxygen"), question("Carbon fixation", "Rubisco")]),
    )

    await quiz.generate("notes", false)
    expect(quiz.snapshot().memory.session).toEqual({ answered: 0, correct: 0, total: 2 })
    expect(quiz.snapshot().memory.longTerm.quizzes).toBe(1)
    const opened = quiz.snapshot()
    quiz.choose("other")
    expect(opened.memory.topics).toEqual([])
    expect(opened.memory.session.answered).toBe(0)
    quiz.go(1)
    quiz.choose("Rubisco")
    quiz.choose("again")

    expect(quiz.snapshot().memory.session).toEqual({ answered: 2, correct: 1, total: 2 })
    expect(quiz.snapshot().memory.longTerm).toEqual({ quizzes: 1, answered: 2, correct: 1 })
    expect(weakTopics(quiz.snapshot().memory.topics)).toEqual(["Light reactions"])

    await quiz.generate("notes", false)
    expect(quiz.snapshot().memory.session).toEqual({ answered: 0, correct: 0, total: 2 })
    expect(quiz.snapshot().memory.longTerm.quizzes).toBe(2)
    expect(quiz.snapshot().memory.topics).toEqual([
      { topic: "Carbon fixation", seen: 1, correct: 1 },
      { topic: "Light reactions", seen: 1, correct: 0 },
    ])
  })

  test("a topic leaves the weak list once most answers are right", async () => {
    const quiz = createBrowserQuiz(
      { localStorage: fakeStorage() },
      localWriters([question("Carbon fixation", "Rubisco")]),
    )

    await quiz.generate("notes", false)
    quiz.choose("other")
    expect(weakTopics(quiz.snapshot().memory.topics)).toEqual(["Carbon fixation"])
    await quiz.generate("notes", false)
    quiz.choose("Rubisco")
    await quiz.generate("notes", false)
    quiz.choose("Rubisco")
    expect(weakTopics(quiz.snapshot().memory.topics)).toEqual([])
  })

  test("weak topics put the lower accuracy first and the busier tie first", () => {
    expect(
      weakTopics([
        { topic: "Carbon fixation", seen: 2, correct: 1 },
        { topic: "Light reactions", seen: 4, correct: 0 },
        { topic: "Notes", seen: 1, correct: 1 },
      ]),
    ).toEqual(["Light reactions", "Carbon fixation"])
    expect(
      weakTopics([
        { topic: "Alpha", seen: 1, correct: 0 },
        { topic: "Beta", seen: 3, correct: 0 },
      ]),
    ).toEqual(["Beta", "Alpha"])
  })

  test("empty notes and an empty quiz do not increment the score", async () => {
    const quiz = createBrowserQuiz({ localStorage: fakeStorage() }, localWriters([]))
    await quiz.generate("   ", false)
    expect(quiz.snapshot().message).toBe("Paste notes or load the sample passage first.")
    expect(quiz.snapshot().memory.longTerm.quizzes).toBe(0)

    await quiz.generate("short", false)
    expect(quiz.snapshot().questions).toEqual([])
    expect(quiz.snapshot().message).toBe(
      "Not enough full sentences to build a quiz. Try the sample notes.",
    )
    expect(quiz.snapshot().memory.longTerm.quizzes).toBe(0)
    expect(quiz.snapshot().busy).toBe(false)
  })

  test("a short model reply falls back to the local quiz", async () => {
    const quiz = createBrowserQuiz(
      { localStorage: fakeStorage() },
      {
        writeQuiz: () => [question("local", "keep")],
        modelQuiz: async () => [question("thin", "no")],
        modelKey: () => "key",
      },
    )
    await quiz.generate("notes", true)
    expect(quiz.snapshot().mode).toBe("local")
    expect(quiz.snapshot().questions.map((item) => item.topic)).toEqual(["local"])
    expect(quiz.snapshot().message).toBe("The model returned too little, so this quiz is local.")
    expect(quiz.snapshot().memory.longTerm.quizzes).toBe(1)
    expect(quiz.snapshot().busy).toBe(false)
  })

  test("a model failure still starts the local quiz", async () => {
    const quiz = createBrowserQuiz(
      { localStorage: fakeStorage() },
      {
        writeQuiz: () => [question("local", "keep")],
        modelQuiz: async () => {
          throw new Error("Model request failed (500).")
        },
        modelKey: () => "key",
      },
    )
    await quiz.generate("notes", true)
    expect(quiz.snapshot().questions.map((item) => item.topic)).toEqual(["local"])
    expect(quiz.snapshot().message).toBe(
      "Model request failed (500). Showing a local quiz instead.",
    )
    expect(quiz.snapshot().busy).toBe(false)
    expect(quiz.snapshot().memory.longTerm.quizzes).toBe(1)
  })

  test("go moves only inside the quiz", async () => {
    const quiz = createBrowserQuiz(
      { localStorage: fakeStorage() },
      localWriters([question("one", "a"), question("two", "b")]),
    )
    await quiz.generate("notes", false)
    quiz.go(1)
    expect(quiz.snapshot().index).toBe(1)
    quiz.go(-1)
    quiz.go(4)
    expect(quiz.snapshot().index).toBe(1)
  })
})
