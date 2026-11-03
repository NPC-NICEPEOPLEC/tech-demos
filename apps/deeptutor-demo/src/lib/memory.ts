export type TopicStat = {
  seen: number
  correct: number
}

export type Memory = {
  session: {
    answered: number
    correct: number
    total: number
  }
  topics: Record<string, TopicStat>
  longTerm: {
    quizzes: number
    answered: number
    correct: number
    weakSpots: string[]
  }
}

export const MEMORY_KEY = "deeptutor.memory.v1"

export function emptyMemory(): Memory {
  return {
    session: { answered: 0, correct: 0, total: 0 },
    topics: {},
    longTerm: { quizzes: 0, answered: 0, correct: 0, weakSpots: [] },
  }
}

export function listWeakSpots(topics: Record<string, TopicStat>): string[] {
  return Object.entries(topics)
    .filter(([, stat]) => stat.seen > 0 && stat.correct / stat.seen < 0.6)
    .sort((left, right) => {
      const leftRate = left[1].correct / left[1].seen
      const rightRate = right[1].correct / right[1].seen
      if (leftRate !== rightRate) return leftRate - rightRate
      return right[1].seen - left[1].seen
    })
    .map(([topic]) => topic)
}

export function startQuiz(memory: Memory, total: number): Memory {
  return {
    ...memory,
    session: { answered: 0, correct: 0, total },
    longTerm: {
      ...memory.longTerm,
      quizzes: memory.longTerm.quizzes + 1,
    },
  }
}

export function recordAnswer(
  memory: Memory,
  topic: string,
  correct: boolean,
): Memory {
  const previous = memory.topics[topic] ?? { seen: 0, correct: 0 }
  const topics = {
    ...memory.topics,
    [topic]: {
      seen: previous.seen + 1,
      correct: previous.correct + (correct ? 1 : 0),
    },
  }
  return {
    session: {
      ...memory.session,
      answered: memory.session.answered + 1,
      correct: memory.session.correct + (correct ? 1 : 0),
    },
    topics,
    longTerm: {
      ...memory.longTerm,
      answered: memory.longTerm.answered + 1,
      correct: memory.longTerm.correct + (correct ? 1 : 0),
      weakSpots: listWeakSpots(topics),
    },
  }
}

function isMemory(value: unknown): value is Memory {
  if (!value || typeof value !== "object") return false
  const memory = value as Memory
  return (
    typeof memory.session?.answered === "number" &&
    typeof memory.session.correct === "number" &&
    typeof memory.session.total === "number" &&
    typeof memory.topics === "object" &&
    memory.topics !== null &&
    typeof memory.longTerm?.quizzes === "number" &&
    typeof memory.longTerm.answered === "number" &&
    typeof memory.longTerm.correct === "number" &&
    Array.isArray(memory.longTerm.weakSpots)
  )
}

export function loadMemory(): Memory {
  if (typeof localStorage === "undefined") return emptyMemory()
  try {
    const raw = localStorage.getItem(MEMORY_KEY)
    if (!raw) return emptyMemory()
    const parsed: unknown = JSON.parse(raw)
    return isMemory(parsed) ? parsed : emptyMemory()
  } catch {
    return emptyMemory()
  }
}

export function saveMemory(memory: Memory): void {
  if (typeof localStorage === "undefined") return
  localStorage.setItem(MEMORY_KEY, JSON.stringify(memory))
}

export function clearMemory(): void {
  if (typeof localStorage === "undefined") return
  localStorage.removeItem(MEMORY_KEY)
}
