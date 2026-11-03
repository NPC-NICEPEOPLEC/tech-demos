import type { QuizQuestion } from "@/lib/quiz"

export function llmKey(): string | null {
  const key = import.meta.env.VITE_LLM_API_KEY
  if (typeof key !== "string") return null
  const trimmed = key.trim()
  return trimmed.length > 0 ? trimmed : null
}

function isQuestion(value: unknown): value is Omit<QuizQuestion, "id"> {
  if (!value || typeof value !== "object") return false
  const question = value as Partial<QuizQuestion>
  return (
    typeof question.topic === "string" &&
    typeof question.prompt === "string" &&
    typeof question.answer === "string" &&
    typeof question.explanation === "string" &&
    Array.isArray(question.choices) &&
    question.choices.length >= 2 &&
    question.choices.every((choice) => typeof choice === "string") &&
    question.choices.includes(question.answer)
  )
}

export async function generateQuizWithModel(
  notes: string,
  key: string,
): Promise<QuizQuestion[]> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(20000),
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Write a 4-question multiple-choice quiz grounded only in the student's notes. Reply with JSON {\"questions\":[{\"topic\":string,\"prompt\":string,\"choices\":string[],\"answer\":string,\"explanation\":string}]}. Each answer must be copied from the notes and included in choices. Explanations must quote the supporting sentence.",
        },
        { role: "user", content: notes },
      ],
    }),
  })

  if (!response.ok) {
    throw new Error(`Model request failed (${response.status}).`)
  }

  const body: unknown = await response.json()
  const content =
    body &&
    typeof body === "object" &&
    "choices" in body &&
    Array.isArray(body.choices)
      ? (body.choices[0] as { message?: { content?: unknown } } | undefined)
          ?.message?.content
      : undefined
  if (typeof content !== "string") {
    throw new Error("Model response did not include quiz text.")
  }

  const parsed: unknown = JSON.parse(content)
  const questions =
    parsed && typeof parsed === "object" && "questions" in parsed
      ? parsed.questions
      : null
  if (!Array.isArray(questions)) {
    throw new Error("Model response was not a quiz.")
  }

  return questions.filter(isQuestion).slice(0, 5).map((question, index) => ({
    ...question,
    id: `model-${index}-${question.answer}`,
  }))
}
