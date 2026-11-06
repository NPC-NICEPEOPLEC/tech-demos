import { useMemo, useRef, useState, type ChangeEvent } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { analyzeLog, type Analysis } from "@/lib/analyze.ts"
import { SAMPLE_LOG } from "@/lib/sample-log.ts"

const MAX_UPLOAD_BYTES = 2_000_000

export default function App() {
  const [log, setLog] = useState("")
  const [keyPages, setKeyPages] = useState("/, /pricing, /docs")
  const [notice, setNotice] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const analysis = useMemo(() => analyzeLog(log, keyPages), [log, keyPages])
  const hasLog = log.trim().length > 0

  function loadSample() {
    setNotice(null)
    setLog(SAMPLE_LOG)
  }

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    if (file.size > MAX_UPLOAD_BYTES) {
      setNotice("Upload a smaller log (under 2 MB).")
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setNotice(null)
        setLog(reader.result)
      }
    }
    reader.onerror = () => setNotice("Could not read that file.")
    reader.readAsText(file)
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6">
      <header className="flex flex-col gap-1">
        <p className="text-xs text-muted-foreground">Local demo</p>
        <h1 className="font-heading text-2xl font-medium tracking-tight">GEOInflow</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Paste a combined or nginx access log. See which AI crawlers requested which paths, and which key pages got zero crawls.
        </p>
      </header>

      <div className="grid items-start gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Access log</CardTitle>
              <CardDescription>Stays in this browser. Combined or nginx format.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Label htmlFor="access-log">Log lines</Label>
              <Textarea
                id="access-log"
                value={log}
                onChange={(event) => {
                  setNotice(null)
                  setLog(event.target.value)
                }}
                spellCheck={false}
                wrap="off"
                placeholder={'127.0.0.1 - - [02/Nov/2026:03:14:22 +0000] "GET / HTTP/1.1" 200 4821 "-" "...GPTBot..."'}
                className="h-72 field-sizing-fixed resize-y"
              />
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={loadSample}>
                  Load sample log
                </Button>
                <Button type="button" variant="outline" onClick={() => fileInput.current?.click()}>
                  Upload file
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setNotice(null)
                    setLog("")
                  }}
                  disabled={!hasLog}
                >
                  Clear
                </Button>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".log,.txt,text/plain"
                  aria-label="Upload access log"
                  className="sr-only"
                  onChange={onFile}
                />
              </div>
              {notice ? (
                <p role="status" className="text-destructive">
                  {notice}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Key pages</CardTitle>
              <CardDescription>Paths you expect crawlers to request. Comma or space separated.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Label htmlFor="key-pages">Paths</Label>
              <Input
                id="key-pages"
                value={keyPages}
                onChange={(event) => setKeyPages(event.target.value)}
                spellCheck={false}
                placeholder="/, /pricing, /docs"
              />
            </CardContent>
          </Card>
        </div>

        <section aria-live="polite" className="flex flex-col gap-4">
          {hasLog ? <Results analysis={analysis} /> : <EmptyState />}
        </section>
      </div>
    </main>
  )
}

function EmptyState() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>No log loaded</CardTitle>
        <CardDescription>
          Load the sample log, paste lines, or upload a file. Bot and path counts show up here.
        </CardDescription>
      </CardHeader>
    </Card>
  )
}

function Results({ analysis }: { analysis: Analysis }) {
  if (analysis.parsedLines === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Nothing to classify</CardTitle>
          <CardDescription>
            {analysis.skippedLines} line{analysis.skippedLines === 1 ? "" : "s"} did not match combined or nginx access-log format.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const maxHits = analysis.botTotals[0]?.hits ?? 1

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Lines parsed" value={analysis.parsedLines} />
        <Stat label="AI crawler hits" value={analysis.aiHits} />
        <Stat label="Crawlers" value={analysis.botTotals.length} />
        <Stat label="Lines skipped" value={analysis.skippedLines} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {analysis.zeroCrawlPages.length === 0
              ? "Key pages covered"
              : `${analysis.zeroCrawlPages.length} key ${analysis.zeroCrawlPages.length === 1 ? "page" : "pages"} with zero crawls`}
          </CardTitle>
          <CardDescription>
            A page counts as crawled only when an AI crawler user agent requested that exact path.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {analysis.zeroCrawlPages.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {analysis.zeroCrawlPages.map((path) => (
                <Badge key={path} variant="destructive">
                  {path}
                </Badge>
              ))}
            </div>
          ) : (
            <p>Every key page in the list was requested by an AI crawler.</p>
          )}
          {analysis.crawledKeyPages.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-muted-foreground">Crawled</p>
              <div className="flex flex-wrap gap-2">
                {analysis.crawledKeyPages.map((path) => (
                  <Badge key={path} variant="secondary">
                    {path}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hits by crawler</CardTitle>
          <CardDescription>
            {analysis.unmatchedLines} other line{analysis.unmatchedLines === 1 ? "" : "s"} did not match an AI crawler. Matched on the User-Agent string only.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {analysis.botTotals.length === 0 ? (
            <p>No AI crawler user agents in this log.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {analysis.botTotals.map((row) => (
                <li key={row.botId} className="grid grid-cols-[9.5rem_minmax(0,1fr)_2rem] items-center gap-2">
                  <span className="truncate" title={`${row.bot} · ${row.vendor}`}>
                    {row.bot}
                  </span>
                  <div className="h-2 bg-muted" aria-hidden="true">
                    <div
                      className="h-2 bg-foreground"
                      style={{
                        width: `${(row.hits / maxHits) * 100}%`,
                        minWidth: "2px",
                      }}
                    />
                  </div>
                  <span className="text-right tabular-nums">{row.hits}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bot and path</CardTitle>
          <CardDescription>One row per crawler and path.</CardDescription>
        </CardHeader>
        <CardContent>
          {analysis.rows.length === 0 ? (
            <p>No AI crawler hits to list.</p>
          ) : (
            <div className="max-h-80 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Bot</TableHead>
                    <TableHead scope="col">Purpose</TableHead>
                    <TableHead scope="col">Path</TableHead>
                    <TableHead scope="col" className="text-right">
                      Hits
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analysis.rows.map((row) => (
                    <TableRow key={`${row.botId}:${row.path}`}>
                      <TableCell>
                        <span className="flex items-center gap-2">
                          {row.bot}
                          <Badge variant="outline">{row.vendor}</Badge>
                        </span>
                      </TableCell>
                      <TableCell>{row.purpose}</TableCell>
                      <TableCell>{row.path}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.hits}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-xl tabular-nums">{value}</CardTitle>
      </CardHeader>
    </Card>
  )
}
