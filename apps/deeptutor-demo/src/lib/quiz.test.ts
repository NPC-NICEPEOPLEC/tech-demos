import { describe, expect, test } from "bun:test"
import { SAMPLE_NOTES, generateQuizLocal } from "./quiz"

describe("generateQuizLocal", () => {
  test("builds a stable 5-question quiz from the sample notes", () => {
    const first = generateQuizLocal(SAMPLE_NOTES)
    const second = generateQuizLocal(SAMPLE_NOTES)

    expect(first).toEqual(second)
    expect(first.length).toBe(5)
    expect(first.map((question) => question.answer)).toEqual([
      "Chlorophyll",
      "Rubisco",
      "oxygen",
      "glucose",
      "680 nanometers",
    ])
  })

  test("keeps every answer inside the explanation and the choices", () => {
    for (const question of generateQuizLocal(SAMPLE_NOTES)) {
      expect(question.choices).toContain(question.answer)
      expect(new Set(question.choices).size).toBe(question.choices.length)
      expect(question.choices.length).toBe(4)
      expect(question.explanation).toContain(question.answer)
      expect(question.prompt.toLowerCase()).not.toContain(
        question.answer.toLowerCase(),
      )
      expect(question.topic === "Light reactions" || question.topic === "Carbon fixation").toBe(
        true,
      )
    }
  })

  test("returns nothing for notes that are too short to quiz", () => {
    expect(generateQuizLocal("")).toEqual([])
    expect(generateQuizLocal("Short note.")).toEqual([])
  })

  test("still quizzes a paragraph that has no headings", () => {
    const questions = generateQuizLocal(
      "Chlorophyll is the pigment that absorbs red and blue light. Plants release oxygen during photosynthesis in the leaves.",
    )
    expect(questions.length).toBeGreaterThanOrEqual(1)
    expect(questions[0]?.topic).toBe("Notes")
    expect(questions[0]?.answer).toBe("Chlorophyll")
  })
})
