import { describe, expect, test } from "bun:test"
import {
  emptyMemory,
  listWeakSpots,
  recordAnswer,
  startQuiz,
} from "./memory"

describe("memory", () => {
  test("starts a quiz without dropping topic history", () => {
    const started = startQuiz(
      recordAnswer(emptyMemory(), "Light reactions", false),
      4,
    )
    expect(started.session).toEqual({ answered: 0, correct: 0, total: 4 })
    expect(started.longTerm.quizzes).toBe(1)
    expect(started.topics["Light reactions"]).toEqual({ seen: 1, correct: 0 })
  })

  test("records scores and lists the weakest topic first", () => {
    let memory = startQuiz(emptyMemory(), 3)
    memory = recordAnswer(memory, "Light reactions", false)
    memory = recordAnswer(memory, "Carbon fixation", true)
    memory = recordAnswer(memory, "Light reactions", false)

    expect(memory.session).toEqual({ answered: 3, correct: 1, total: 3 })
    expect(memory.longTerm.answered).toBe(3)
    expect(memory.longTerm.correct).toBe(1)
    expect(memory.topics["Light reactions"]).toEqual({ seen: 2, correct: 0 })
    expect(listWeakSpots(memory.topics)).toEqual(["Light reactions"])
    expect(memory.longTerm.weakSpots).toEqual(["Light reactions"])
  })

  test("drops a topic from weak spots once accuracy recovers", () => {
    let memory = emptyMemory()
    memory = recordAnswer(memory, "Carbon fixation", false)
    expect(memory.longTerm.weakSpots).toEqual(["Carbon fixation"])
    memory = recordAnswer(memory, "Carbon fixation", true)
    memory = recordAnswer(memory, "Carbon fixation", true)
    expect(memory.longTerm.weakSpots).toEqual([])
  })

  test("does not mutate the previous memory object", () => {
    const initial = emptyMemory()
    recordAnswer(initial, "Notes", true)
    expect(initial).toEqual(emptyMemory())
  })
})