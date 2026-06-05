// Parses fenced code blocks whose info string contains a file path, e.g.
//   ```tsx src/App.tsx
//   ...code...
//   ```
// Returns the files the coding agent wants to create/update.
export interface ParsedFile {
  path: string
  code: string
}

// Matches a fenced block. The closing ``` is OPTIONAL (anchored to end of string)
// so a truncated/streaming final block is still captured instead of being lost —
// this is what stops the agent from "not coding" when the output gets cut off.
const FENCE = /```([^\n`]*)\n([\s\S]*?)(?:```|$)/g

function looksLikePath(token: string): boolean {
  return token.includes('/') || /\.[a-z0-9]+$/i.test(token)
}

// Map a bare language tag (no path) to a sensible default file for a static site.
function langToPath(lang: string): string | null {
  const l = lang.toLowerCase()
  if (l === 'html' || l === 'htm') return '/index.html'
  if (l === 'css') return '/styles.css'
  if (l === 'js' || l === 'javascript' || l === 'jsx') return '/script.js'
  return null
}

/** Resolve a fence info string ("html /index.html", "css", "/about.html") to a path. */
export function pathFromInfo(info: string): string | null {
  const tokens = info.trim().split(/\s+/)
  let path: string | undefined
  if (tokens.length >= 2 && looksLikePath(tokens[tokens.length - 1])) {
    path = tokens[tokens.length - 1]
  } else if (tokens.length === 1 && looksLikePath(tokens[0])) {
    path = tokens[0]
  }
  if (!path) path = langToPath(tokens[0]) ?? undefined
  if (!path) return null
  if (!path.startsWith('/')) path = '/' + path
  return path
}

export function parseCodeFiles(markdown: string): ParsedFile[] {
  const files: ParsedFile[] = []
  let m: RegExpExecArray | null
  FENCE.lastIndex = 0
  while ((m = FENCE.exec(markdown))) {
    const info = m[1].trim()
    const code = m[2].replace(/\n$/, '')
    if (!info || !code.trim()) continue
    const path = pathFromInfo(info)
    if (!path) continue
    files.push({ path, code })
  }
  // Still nothing? Salvage an HTML document written without a proper fence —
  // including a truncated one that never reached </html>.
  if (!files.length) {
    const full = markdown.match(/<!doctype html>[\s\S]*?<\/html>/i) || markdown.match(/<html[\s\S]*?<\/html>/i)
    const partial = markdown.match(/<!doctype html>[\s\S]*$/i) || markdown.match(/<html[\s\S]*$/i)
    const doc = full || partial
    if (doc && doc[0].trim().length > 40) files.push({ path: '/index.html', code: doc[0] })
  }
  return files
}
