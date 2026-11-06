import { writeFileSync } from "node:fs"

export function parseJsonc(text: string): unknown {
  const value: unknown = JSON.parse(stripJsonc(text))
  return value
}

export function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function stripJsonc(text: string): string {
  let out = ""
  let index = 0
  while (index < text.length) {
    const char = text[index]
    if (char === undefined) break
    if (char === '"') {
      const end = endOfString(text, index)
      out += text.slice(index, end)
      index = end
      continue
    }
    if (char === "/" && text[index + 1] === "/") {
      index += 2
      while (index < text.length && text[index] !== "\n") index += 1
      continue
    }
    if (char === "/" && text[index + 1] === "*") {
      index += 2
      while (index < text.length && !(text[index] === "*" && text[index + 1] === "/")) {
        index += 1
      }
      index = Math.min(text.length, index + 2)
      continue
    }
    if (char === ",") {
      let look = index + 1
      while (look < text.length && isSpace(text[look])) look += 1
      if (text[look] === "}" || text[look] === "]") {
        index += 1
        continue
      }
    }
    out += char
    index += 1
  }
  return out
}

function endOfString(text: string, start: number): number {
  let index = start + 1
  while (index < text.length) {
    if (text[index] === "\\") {
      index += 2
      continue
    }
    if (text[index] === '"') return index + 1
    index += 1
  }
  return text.length
}

function isSpace(char: string | undefined): boolean {
  return char === " " || char === "\n" || char === "\r" || char === "\t"
}
