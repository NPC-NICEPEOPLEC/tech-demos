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
import { Progress, ProgressLabel } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { Memory } from "@/lib/memory"

function percent(correct: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((correct / total) * 100)
}

export function MemoryPanel({
  memory,
  onReset,
}: {
  memory: Memory
  onReset: () => void
}) {
  const topics = Object.entries(memory.topics).sort((left, right) =>
    left[0].localeCompare(right[0]),
  )
  const longTerm = memory.longTerm

  return (
    <Card className="text-sm">
      <CardHeader>
        <CardTitle>Memory</CardTitle>
        <CardDescription>
          Three layers stay in this browser: this quiz, each topic, and a
          long-term summary. Reloading keeps the scores and starts the quiz
          fresh.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="session">
          <TabsList>
            <TabsTrigger value="session">Session</TabsTrigger>
            <TabsTrigger value="topics">Topics</TabsTrigger>
            <TabsTrigger value="long-term">Long-term</TabsTrigger>
          </TabsList>
          <TabsContent value="session" className="pt-3">
            {memory.session.total === 0 ? (
              <p className="text-muted-foreground">
                No quiz in this session yet.
              </p>
            ) : (
              <Progress
                value={percent(memory.session.answered, memory.session.total)}
              >
                <ProgressLabel>
                  {memory.session.correct}/{memory.session.answered} correct ·{" "}
                  {memory.session.answered}/{memory.session.total} answered
                </ProgressLabel>
              </Progress>
            )}
          </TabsContent>
          <TabsContent value="topics" className="flex flex-col gap-3 pt-3">
            {topics.length === 0 ? (
              <p className="text-muted-foreground">
                Topics show up after you answer a question.
              </p>
            ) : (
              topics.map(([topic, stat]) => (
                <Progress key={topic} value={percent(stat.correct, stat.seen)}>
                  <ProgressLabel>
                    {topic} · {stat.correct}/{stat.seen}
                  </ProgressLabel>
                </Progress>
              ))
            )}
          </TabsContent>
          <TabsContent value="long-term" className="flex flex-col gap-3 pt-3">
            <Progress value={percent(longTerm.correct, longTerm.answered)}>
              <ProgressLabel>
                {longTerm.quizzes} {longTerm.quizzes === 1 ? "quiz" : "quizzes"} ·{" "}
                {longTerm.correct}/{longTerm.answered} correct
              </ProgressLabel>
            </Progress>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">Weak spots</span>
              {longTerm.weakSpots.length === 0 ? (
                <span>None yet.</span>
              ) : (
                longTerm.weakSpots.map((topic) => (
                  <Badge key={topic} variant="destructive">
                    {topic}
                  </Badge>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
      <CardFooter>
        <Button variant="outline" onClick={onReset}>
          Reset memory
        </Button>
      </CardFooter>
    </Card>
  )
}
