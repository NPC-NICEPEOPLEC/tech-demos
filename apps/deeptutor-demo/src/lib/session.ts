import {
  createMemoryPort,
  emptyMemory,
  type MemoryState,
  type StorageLike,
} from "./memory-port"
import type { QuizQuestion } from "./quiz"

export type TopicScore = {
  readonly topic: string
  readonly seen: number
  readonly correct: number
}

export type QuizMemory = {
  readonly session: {
    readonly answered: number
    readonly correct: number
    readonly total: number
  }
  readonly topics: readonly TopicScore[]
  readonly longTerm: {
    readonly quizzes: number
    readonly answered: number
    readonly correct: number
  }
}

export type QuizSnapshot = {
  readonly questions: readonly QuizQuestion[]
  readonly index: number
  readonly picks: Readonly<Record<string, string>>
  readonly memory: QuizMemory
  readonly mode: "local" | "model"
  readonly busy: boolean
  readonly message: string | null
}

type Writers = {
  readonly writeQuiz: (notes: string) => readonly QuizQuestion[]
  readonly modelQuiz: (notes: string, key: string) => Promise<readonly QuizQuestion[]>
  readonly modelKey: () => string | null
}

const EMPTY_NOTES = "Paste notes or load the sample passage first."
const SHORT_NOTES = "Not enough full sentences to build a quiz. Try the sample notes."
const THIN_MODEL = "The model returned too little, so this quiz is local."
const CLEARED = "Memory cleared on this browser."
const SAVE_FAILED = "Could not save this quiz on this browser."

export function weakTopics(topics: readonly TopicScore[]): readonly string[] {
  return topics
    .filter((topic) => topic.seen > 0 && topic.correct / topic.seen < 0.6)
    .slice()
    .sort((left, right) => {
      const leftRate = left.correct / left.seen
      const rightRate = right.correct / right.seen
      if (leftRate !== rightRate) return leftRate - rightRate
      return right.seen - left.seen
    })
    .map((topic) => topic.topic)
}

export function createBrowserQuiz(
  host: { readonly localStorage: StorageLike },
  writers: Writers,
): {
  subscribe: (listener: () => void) => () => void
  snapshot: () => QuizSnapshot
  generate: (notes: string, useModel: boolean) => Promise<void>
  choose: (choice: string) => void
  go: (index: number) => void
  reset: () => void
} {
  const port = createMemoryPort(host.localStorage)
  let epoch = 0
  let memory = port.read()
  let questions: readonly QuizQuestion[] = []
  let index = 0
  let picks = new Map<string, string>()
  let mode: "local" | "model" = "local"
  let busy = false
  let message: string | null = null
  let current = paint()
  const listeners = new Set<() => void>()

  function paint(): QuizSnapshot {
    return {
      questions,
      index,
      picks: picksRecord(picks),
      memory: project(memory),
      mode,
      busy,
      message,
    }
  }

  function emit(): void {
    current = paint()
    for (const listener of [...listeners]) listener()
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  function snapshot(): QuizSnapshot {
    return current
  }

  async function generate(notes: string, useModel: boolean): Promise<void> {
    const source = notes.trim()
    if (source.length === 0) {
      message = EMPTY_NOTES
      emit()
      return
    }

    const ticket = ++epoch
    const key = useModel ? writers.modelKey() : null
    let nextMode: "local" | "model" = "local"
    let nextMessage: string | null = null
    let modeled: readonly QuizQuestion[] | null = null

    if (key !== null) {
      busy = true
      message = null
      emit()
      try {
        const reply = await writers.modelQuiz(source, key)
        if (ticket !== epoch) return
        if (reply.length >= 3) {
          modeled = reply
          nextMode = "model"
        } else {
          nextMessage = THIN_MODEL
        }
      } catch (error) {
        if (ticket !== epoch) return
        const reason = error instanceof Error ? error.message : "Model request failed."
        nextMessage = `${reason} Showing a local quiz instead.`
      }
    }

    if (ticket !== epoch) return
    const nextQuestions = modeled ?? writers.writeQuiz(source)

    if (nextQuestions.length === 0) {
      questions = []
      index = 0
      picks = new Map()
      busy = false
      message = SHORT_NOTES
      emit()
      return
    }

    startQuiz(ticket, nextQuestions, nextMode, nextMessage)
  }

  function startQuiz(
    ticket: number,
    nextQuestions: readonly QuizQuestion[],
    nextMode: "local" | "model",
    nextMessage: string | null,
  ): void {
    if (ticket !== epoch) return
    const nextMemory = openQuiz(memory, nextQuestions.length)
    try {
      port.write(nextMemory)
    } catch {
      if (ticket !== epoch || !busy) return
      busy = false
      message = SAVE_FAILED
      emit()
      return
    }
    memory = nextMemory
    questions = [...nextQuestions]
    index = 0
    picks = new Map()
    mode = nextMode
    busy = false
    message = nextMessage
    emit()
  }

  function choose(choice: string): void {
    const question = questions.at(index)
    if (question === undefined || picks.has(question.id)) return
    const nextMemory = recordAnswer(memory, question.topic, choice === question.answer)
    try {
      port.write(nextMemory)
    } catch {
      return
    }
    memory = nextMemory
    const nextPicks = new Map(picks)
    nextPicks.set(question.id, choice)
    picks = nextPicks
    emit()
  }

  function go(nextIndex: number): void {
    if (!Number.isInteger(nextIndex)) return
    if (nextIndex < 0 || nextIndex >= questions.length || nextIndex === index) return
    index = nextIndex
    emit()
  }

  function reset(): void {
    epoch += 1
    try {
      port.clear()
    } catch {
      return
    }
    memory = emptyMemory()
    questions = []
    index = 0
    picks = new Map()
    mode = "local"
    busy = false
    message = CLEARED
    emit()
  }

  return { subscribe, snapshot, generate, choose, go, reset }
}

function openQuiz(state: MemoryState, total: number): MemoryState {
  return {
    session: { answered: 0, correct: 0, total },
    topics: new Map(state.topics),
    longTerm: {
      quizzes: state.longTerm.quizzes + 1,
      answered: state.longTerm.answered,
      correct: state.longTerm.correct,
    },
  }
}

function recordAnswer(state: MemoryState, topic: string, correct: boolean): MemoryState {
  const previous = state.topics.get(topic) ?? { seen: 0, correct: 0 }
  const topics = new Map(state.topics)
  topics.set(topic, {
    seen: previous.seen + 1,
    correct: previous.correct + (correct ? 1 : 0),
  })
  return {
    session: {
      answered: state.session.answered + 1,
      correct: state.session.correct + (correct ? 1 : 0),
      total: state.session.total,
    },
    topics,
    longTerm: {
      quizzes: state.longTerm.quizzes,
      answered: state.longTerm.answered + 1,
      correct: state.longTerm.correct + (correct ? 1 : 0),
    },
  }
}

function project(state: MemoryState): QuizMemory {
  return {
    session: {
      answered: state.session.answered,
      correct: state.session.correct,
      total: state.session.total,
    },
    topics: [...state.topics.entries()]
      .sort((left, right) => compareText(left[0], right[0]))
      .map(([topic, counts]) => ({
        topic,
        seen: counts.seen,
        correct: counts.correct,
      })),
    longTerm: {
      quizzes: state.longTerm.quizzes,
      answered: state.longTerm.answered,
      correct: state.longTerm.correct,
    },
  }
}

function picksRecord(source: ReadonlyMap<string, string>): Readonly<Record<string, string>> {
  return Object.fromEntries(source)
}

function compareText(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}
