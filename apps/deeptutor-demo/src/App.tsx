import { useState, useSyncExternalStore } from "react"
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
import { SAMPLE_NOTES, generateQuizLocal } from "@/lib/quiz"
import { createBrowserQuiz } from "@/lib/session"
import { cn } from "@/lib/utils"

const modelAvailable = llmKey() !== null

export default function App() {
  const [notes, setNotes] = useState("")
  const [useModel, setUseModel] = useState(false)
  const [controller] = useState(() =>
    createBrowserQuiz(window, {
      writeQuiz: generateQuizLocal,
      modelQuiz: generateQuizWithModel,
      modelKey: llmKey,
    }),
  )
  const quiz = useSyncExternalStore(controller.subscribe, controller.snapshot)

  const question = quiz.questions.at(quiz.index) ?? null
  const answered = quiz.questions.filter((item) => quiz.picks[item.id]).length

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-2xl flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-2xl font-medium tracking-tight">
              DeepTutor
            </h1>
            <Badge variant="outline">
              {quiz.mode === "model" ? "Model" : "Local heuristics"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Paste study notes and take a short quiz grounded in that text.
            A lightweight taste of a lifelong tutor: session, topic, and
            long-term memory stay on this device.
          </p>
        </div>
        <p className="text-sm text-muted-foreground tabular-nums">
          {quiz.memory.longTerm.correct}/{quiz.memory.longTerm.answered} correct overall
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
              }}
            >
              Load sample notes
            </Button>
            <Button
              onClick={() => void controller.generate(notes, useModel)}
              disabled={quiz.busy}
            >
              {quiz.busy ? "Generating…" : "Generate quiz"}
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
              {quiz.questions.length === 0
                ? "Questions are written from the notes in front of you."
                : `${answered}/${quiz.questions.length} answered · question ${quiz.index + 1} of ${quiz.questions.length}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {quiz.message ? <p className="text-muted-foreground">{quiz.message}</p> : null}
            {!question ? (
              <p>
                Load the sample notes, then generate a quiz. No API key is
                required.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{question.topic}</Badge>
                  {quiz.questions.map((item, itemIndex) => (
                    <Button
                      key={item.id}
                      size="xs"
                      variant={itemIndex === quiz.index ? "default" : "outline"}
                      onClick={() => controller.go(itemIndex)}
                      aria-label={`Question ${itemIndex + 1}`}
                    >
                      {itemIndex + 1}
                    </Button>
                  ))}
                </div>
                <p className="text-base leading-relaxed">{question.prompt}</p>
                <div className="flex flex-col gap-2">
                  {question.choices.map((choice) => {
                    const picked = quiz.picks[question.id]
                    const revealed = Boolean(picked)
                    const isAnswer = choice === question.answer
                    const isPick = picked === choice
                    return (
                      <Button
                        key={choice}
                        variant="outline"
                        disabled={revealed}
                        onClick={() => controller.choose(choice)}
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
                {quiz.picks[question.id] ? (
                  <div className="flex flex-col gap-1 border border-border p-3">
                    <p className="font-medium">
                      {quiz.picks[question.id] === question.answer
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
                disabled={quiz.index === 0}
                onClick={() => controller.go(quiz.index - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                disabled={quiz.index >= quiz.questions.length - 1}
                onClick={() => controller.go(quiz.index + 1)}
              >
                Next
              </Button>
            </CardFooter>
          ) : null}
        </Card>
      </div>

      <MemoryPanel memory={quiz.memory} onReset={controller.reset} />
    </main>
  )
}
