import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { MemoryPanel } from "@/components/memory-panel"
import { generateQuizWithModel, llmKey } from "@/lib/llm"
import {
  clearMemory,
  emptyMemory,
  loadMemory,
  recordAnswer,
  saveMemory,
  startQuiz,
  type Memory,
} from "@/lib/memory"
import {
  SAMPLE_NOTES,
  generateQuizLocal,
  type QuizQuestion,
} from "@/lib/quiz"
import { cn } from "@/lib/utils"

const modelAvailable = llmKey() !== null

export default function App() {
  const [notes, setNotes] = useState("")
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [index, setIndex] = useState(0)
  const [picks, setPicks] = useState<Record<string, string>>({})
  const [memory, setMemory] = useState<Memory>(() => loadMemory())
  const [mode, setMode] = useState<"local" | "model">("local")
  const [useModel, setUseModel] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const question = questions[index]
  const answered = questions.filter((item) => picks[item.id]).length

  function commit(update: (current: Memory) => Memory) {
    setMemory((current) => {
      const next = update(current)
      saveMemory(next)
      return next
    })
  }

  async function generate() {
    const source = notes.trim()
    if (!source) {
      setMessage("Paste notes or load the sample passage first.")
      return
    }

    setBusy(true)
    setMessage(null)
    let nextQuestions = generateQuizLocal(source)
    let nextMode: "local" | "model" = "local"
    const key = llmKey()

    if (useModel && key) {
      try {
        const modeled = await generateQuizWithModel(source, key)
        if (modeled.length >= 3) {
          nextQuestions = modeled
          nextMode = "model"
        } else {
          setMessage("The model returned too little, so this quiz is local.")
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Model request failed."
        setMessage(`${reason} Showing a local quiz instead.`)
      }
    }

    if (nextQuestions.length === 0) {
      setQuestions([])
      setMessage("Not enough full sentences to build a quiz. Try the sample notes.")
      setBusy(false)
      return
    }

    setQuestions(nextQuestions)
    setIndex(0)
    setPicks({})
    setMode(nextMode)
    commit((current) => startQuiz(current, nextQuestions.length))
    setBusy(false)
  }

  function choose(choice: string) {
    if (!question || picks[question.id]) return
    const correct = choice === question.answer
    const topic = question.topic
    setPicks((current) => ({ ...current, [question.id]: choice }))
    commit((current) => recordAnswer(current, topic, correct))
  }

  function reset() {
    clearMemory()
    setMemory(emptyMemory())
    setQuestions([])
    setPicks({})
    setIndex(0)
    setMode("local")
    setMessage("Memory cleared on this browser.")
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-2xl flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-2xl font-medium tracking-tight">
              DeepTutor
            </h1>
            <Badge variant="outline">
              {mode === "model" ? "Model" : "Local heuristics"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Paste study notes and take a short quiz grounded in that text.
            A lightweight taste of a lifelong tutor: session, topic, and
            long-term memory stay on this device.
          </p>
        </div>
        <p className="text-sm text-muted-foreground tabular-nums">
          {memory.longTerm.correct}/{memory.longTerm.answered} correct overall
        </p>
      </header>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card className="text-sm">
          <CardHeader>
            <CardTitle>Notes</CardTitle>
            <CardDescription>
              One passage is enough. Headings become topics.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Paste study notes…"
              className="min-h-64 text-sm"
              aria-label="Study notes"
            />
            <p className="text-muted-foreground">
              {notes.trim().length} characters
            </p>
          </CardContent>
          <CardFooter className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setNotes(SAMPLE_NOTES)
                setMessage(null)
              }}
            >
              Load sample notes
            </Button>
            <Button onClick={() => void generate()} disabled={busy}>
              {busy ? "Generating…" : "Generate quiz"}
            </Button>
            {modelAvailable ? (
              <label className="flex items-center gap-2 text-muted-foreground">
                <input
                  type="checkbox"
                  checked={useModel}
                  onChange={(event) => setUseModel(event.target.checked)}
                />
                Use model
              </label>
            ) : null}
          </CardFooter>
        </Card>

        <Card className="text-sm">
          <CardHeader>
            <CardTitle>Quiz</CardTitle>
            <CardDescription>
              {questions.length === 0
                ? "Questions are written from the notes in front of you."
                : `${answered}/${questions.length} answered · question ${index + 1} of ${questions.length}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {message ? <p className="text-muted-foreground">{message}</p> : null}
            {!question ? (
              <p>
                Load the sample notes, then generate a quiz. No API key is
                required.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{question.topic}</Badge>
                  {questions.map((item, itemIndex) => (
                    <Button
                      key={item.id}
                      size="xs"
                      variant={itemIndex === index ? "default" : "outline"}
                      onClick={() => setIndex(itemIndex)}
                      aria-label={`Question ${itemIndex + 1}`}
                    >
                      {itemIndex + 1}
                    </Button>
                  ))}
                </div>
                <p className="text-base leading-relaxed">{question.prompt}</p>
                <div className="flex flex-col gap-2">
                  {question.choices.map((choice) => {
                    const picked = picks[question.id]
                    const revealed = Boolean(picked)
                    const isAnswer = choice === question.answer
                    const isPick = picked === choice
                    return (
                      <Button
                        key={choice}
                        variant="outline"
                        disabled={revealed}
                        onClick={() => choose(choice)}
                        className={cn(
                          "h-auto w-full justify-start px-2.5 py-2 text-left text-sm whitespace-normal",
                          revealed &&
                            isAnswer &&
                            "border-foreground bg-primary text-primary-foreground disabled:opacity-100",
                          revealed &&
                            isPick &&
                            !isAnswer &&
                            "border-destructive text-destructive disabled:opacity-100",
                        )}
                      >
                        {choice}
                      </Button>
                    )
                  })}
                </div>
                {picks[question.id] ? (
                  <div className="flex flex-col gap-1 border border-border p-3">
                    <p className="font-medium">
                      {picks[question.id] === question.answer
                        ? "Correct."
                        : `Not quite. Answer: ${question.answer}.`}
                    </p>
                    <p className="text-muted-foreground">{question.explanation}</p>
                  </div>
                ) : null}
              </>
            )}
          </CardContent>
          {question ? (
            <CardFooter className="flex gap-2">
              <Button
                variant="outline"
                disabled={index === 0}
                onClick={() => setIndex((current) => current - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                disabled={index >= questions.length - 1}
                onClick={() => setIndex((current) => current + 1)}
              >
                Next
              </Button>
            </CardFooter>
          ) : null}
        </Card>
      </div>

      <MemoryPanel memory={memory} onReset={reset} />
    </main>
  )
}
