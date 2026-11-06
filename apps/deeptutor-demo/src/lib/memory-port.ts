export const MEMORY_KEY = "deeptutor.memory.v2"

export type TopicCounts = {
  readonly seen: number
  readonly correct: number
}

export type MemoryState = {
  readonly session: {
    readonly answered: number
    readonly correct: number
    readonly total: number
  }
  readonly topics: ReadonlyMap<string, TopicCounts>
  readonly longTerm: {
    readonly quizzes: number
    readonly answered: number
    readonly correct: number
  }
}

export type StorageLike = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export type MemoryPort = {
  read(): MemoryState
  write(state: MemoryState): void
  clear(): void
}

export function emptyMemory(): MemoryState {
  return {
    session: { answered: 0, correct: 0, total: 0 },
    topics: new Map(),
    longTerm: { quizzes: 0, answered: 0, correct: 0 },
  }
}

export function createMemoryPort(storage: StorageLike): MemoryPort {
  return {
    read() {
      let raw: string | null
      try {
        raw = storage.getItem(MEMORY_KEY)
      } catch {
        return emptyMemory()
      }
      if (raw === null) return emptyMemory()
      try {
        const parsed: unknown = JSON.parse(raw)
        return decode(parsed) ?? emptyMemory()
      } catch {
        return emptyMemory()
      }
    },
    write(state) {
      storage.setItem(MEMORY_KEY, JSON.stringify(encode(state)))
    },
    clear() {
      storage.removeItem(MEMORY_KEY)
    },
  }
}

function encode(state: MemoryState) {
  const topics = [...state.topics.entries()]
    .sort((left, right) => compareText(left[0], right[0]))
    .map(([topic, counts]) => ({
      topic,
      seen: counts.seen,
      correct: counts.correct,
    }))
  return {
    session: {
      answered: state.session.answered,
      correct: state.session.correct,
      total: state.session.total,
    },
    topics,
    longTerm: {
      quizzes: state.longTerm.quizzes,
      answered: state.longTerm.answered,
      correct: state.longTerm.correct,
    },
  }
}

function decode(value: unknown): MemoryState | null {
  if (!isRecord(value)) return null
  const session = value.session
  const longTerm = value.longTerm
  if (!isRecord(session) || !isRecord(longTerm)) return null
  if ("weakSpots" in longTerm) return null
  if (!Array.isArray(value.topics)) return null
  if (
    !isCount(session.answered) ||
    !isCount(session.correct) ||
    !isCount(session.total) ||
    !isCount(longTerm.quizzes) ||
    !isCount(longTerm.answered) ||
    !isCount(longTerm.correct)
  ) {
    return null
  }

  const topics = new Map<string, TopicCounts>()
  for (const entry of value.topics) {
    if (!isRecord(entry) || typeof entry.topic !== "string") return null
    if (!isCount(entry.seen) || !isCount(entry.correct)) return null
    if (topics.has(entry.topic)) return null
    topics.set(entry.topic, { seen: entry.seen, correct: entry.correct })
  }

  return {
    session: {
      answered: session.answered,
      correct: session.correct,
      total: session.total,
    },
    topics,
    longTerm: {
      quizzes: longTerm.quizzes,
      answered: longTerm.answered,
      correct: longTerm.correct,
    },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
}

function compareText(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}
