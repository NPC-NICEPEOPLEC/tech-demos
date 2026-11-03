export type QuizQuestion = {
  id: string
  topic: string
  prompt: string
  choices: string[]
  answer: string
  explanation: string
}

export const SAMPLE_NOTES = `# Light reactions

Chlorophyll is the green pigment that captures light inside chloroplasts.
The light-dependent reactions split water and release oxygen as a byproduct.
Photosystem II absorbs light at 680 nanometers.

# Carbon fixation

Rubisco is the enzyme that fixes carbon dioxide in C3 plants.
The Calvin cycle assembles glucose from carbon dioxide.
CAM plants open their stomata at night to limit water loss.
`

const STOP = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "of",
  "to",
  "in",
  "on",
  "for",
  "with",
  "from",
  "by",
  "as",
  "that",
  "this",
  "these",
  "those",
  "their",
  "its",
  "into",
  "over",
  "after",
  "before",
  "between",
  "about",
  "than",
  "then",
  "when",
  "where",
  "which",
  "while",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "it",
  "at",
  "not",
  "no",
  "yes",
])

type Fact = {
  topic: string
  prompt: string
  answer: string
  sentence: string
}

function hashString(input: string): number {
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function shuffle<T>(items: T[], seed: number): T[] {
  const copy = [...items]
  let state = seed || 1
  for (let index = copy.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    const swap = state % (index + 1)
    const current = copy[index]
    copy[index] = copy[swap]
    copy[swap] = current
  }
  return copy
}

function clean(sentence: string): string {
  return sentence.replace(/\s+/g, " ").replace(/[.!?]+$/, "").trim()
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.split(/\s+/).length >= 6)
}

function parseSections(notes: string): Array<{ topic: string; sentences: string[] }> {
  const sections: Array<{ topic: string; sentences: string[] }> = []
  let topic = "Notes"
  let buffer: string[] = []

  const flush = () => {
    const sentences = splitSentences(buffer.join(" "))
    if (sentences.length > 0) sections.push({ topic, sentences })
    buffer = []
  }

  for (const line of notes.split(/\n/)) {
    const heading = line.match(/^#{1,3}\s+(.+?)\s*$/)
    if (heading) {
      flush()
      topic = heading[1].trim()
      continue
    }
    buffer.push(line)
  }
  flush()
  return sections
}

function blank(sentence: string, phrase: string): string | null {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const pattern = new RegExp(`\\b${escaped}\\b`, "i")
  if (!pattern.test(sentence)) return null
  return `${sentence.replace(pattern, "____")}.`
}

function extractFact(sentence: string, topic: string): Fact | null {
  const source = clean(sentence)

  const definition = source.match(
    /^(?:The\s+)?([A-Z][A-Za-z0-9+-]*(?:\s+[A-Z][A-Za-z0-9+-]*){0,3})\s+(?:is|are)\s+(.{8,160})$/,
  )
  if (definition) {
    const term = definition[1]
    const description = definition[2]
    if (!description.toLowerCase().includes(term.toLowerCase())) {
      return {
        topic,
        prompt: `Which term is ${description}?`,
        answer: term,
        sentence: source,
      }
    }
  }

  const quantity = source.match(/\b(\d+(?:\.\d+)?)\s+([A-Za-z][A-Za-z-]*)\b/)
  if (quantity) {
    const phrase = `${quantity[1]} ${quantity[2]}`
    const prompt = blank(source, phrase)
    if (prompt) {
      return { topic, prompt, answer: phrase, sentence: source }
    }
  }

  const when = source.match(
    /\b(at\s+(?:night|dawn|dusk|noon|midnight|sunrise|sunset))\b/i,
  )
  if (when) {
    const prompt = blank(source, when[1])
    if (prompt) {
      return { topic, prompt, answer: when[1], sentence: source }
    }
  }

  const actions = [
    ...source.matchAll(
      /\b(?:release|releases|produce|produces|absorb|absorbs|assemble|assembles|fix|fixes|capture|captures|split|splits)\s+(?:their\s+|a\s+|an\s+|the\s+)?([A-Za-z][A-Za-z-]{2,})\b/gi,
    ),
  ]
  const action = actions.at(-1)
  if (action) {
    const word = action[1]
    if (!STOP.has(word.toLowerCase())) {
      const prompt = blank(source, word)
      if (prompt && !prompt.toLowerCase().includes(word.toLowerCase())) {
        return { topic, prompt, answer: word, sentence: source }
      }
    }
  }

  const words = source.split(/\s+/)
  let best = ""
  let bestIndex = -1
  words.forEach((word, index) => {
    const bare = word.replace(/[^A-Za-z0-9-]/g, "")
    if (index === 0 || bare.length < 7 || STOP.has(bare.toLowerCase())) return
    if (bare.length > best.length) {
      best = bare
      bestIndex = index
    }
  })
  if (!best || bestIndex < 0) return null
  const promptWords = [...words]
  promptWords[bestIndex] = "____"
  return {
    topic,
    prompt: `${promptWords.join(" ")}.`,
    answer: best,
    sentence: source,
  }
}

function unique(items: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of items) {
    const key = item.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }
  return result
}

function pickDiverse(facts: Fact[], limit: number): Fact[] {
  const byTopic = new Map<string, Fact[]>()
  for (const fact of facts) {
    const list = byTopic.get(fact.topic) ?? []
    list.push(fact)
    byTopic.set(fact.topic, list)
  }
  const picked: Fact[] = []
  let round = 0
  while (picked.length < limit) {
    let added = false
    for (const list of byTopic.values()) {
      const fact = list[round]
      if (!fact) continue
      picked.push(fact)
      added = true
      if (picked.length === limit) break
    }
    if (!added) break
    round += 1
  }
  return picked
}

function choicesFor(answer: string, pool: string[], seed: string): string[] {
  const distractors = shuffle(
    pool.filter((item) => item.toLowerCase() !== answer.toLowerCase()),
    hashString(seed),
  ).slice(0, 3)
  const fillers = ["not stated", "both terms", "none of these"]
  for (const filler of fillers) {
    if (distractors.length >= 3) break
    if (filler.toLowerCase() === answer.toLowerCase()) continue
    distractors.push(filler)
  }
  return shuffle(unique([answer, ...distractors]), hashString(`${seed}:choices`))
}

export function generateQuizLocal(notes: string): QuizQuestion[] {
  const sections = parseSections(notes)
  const facts: Fact[] = []
  const seenAnswers = new Set<string>()

  for (const section of sections) {
    for (const sentence of section.sentences) {
      const fact = extractFact(sentence, section.topic)
      if (!fact) continue
      const key = fact.answer.toLowerCase()
      if (seenAnswers.has(key)) continue
      if (fact.prompt.toLowerCase().includes(key)) continue
      seenAnswers.add(key)
      facts.push(fact)
    }
  }

  const pool = unique([
    ...facts.map((fact) => fact.answer),
    ...sections.flatMap((section) =>
      section.sentences.flatMap((sentence) =>
        [...sentence.matchAll(/\b([A-Z][A-Za-z0-9+-]{3,})\b/g)]
          .map((match) => match[1])
          .filter((word) => !STOP.has(word.toLowerCase())),
      ),
    ),
  ])

  return pickDiverse(facts, 5).map((fact) => ({
    id: `q${hashString(`${fact.sentence}:${fact.answer}`).toString(16)}`,
    topic: fact.topic,
    prompt: fact.prompt,
    choices: choicesFor(fact.answer, pool, fact.sentence),
    answer: fact.answer,
    explanation: `From your notes (${fact.topic}): ${fact.sentence}.`,
  }))
}
