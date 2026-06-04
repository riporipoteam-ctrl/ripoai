// Parses fenced code blocks whose info string contains a file path, e.g.
//   ```tsx src/App.tsx
//   ...code...
//   ```
// Returns the files the coding agent wants to create/update.
export interface ParsedFile {
  path: string
  code: string
}

const FENCE = /```([^\n`]*)\n([\s\S]*?)```/g

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

export function parseCodeFiles(markdown: string): ParsedFile[] {
  const files: ParsedFile[] = []
  let m: RegExpExecArray | null
  while ((m = FENCE.exec(markdown))) {
    const info = m[1].trim()
    const code = m[2].replace(/\n$/, '')
    if (!info) continue
    const tokens = info.split(/\s+/)
    let path: string | undefined
    if (tokens.length >= 2 && looksLikePath(tokens[tokens.length - 1])) {
      path = tokens[tokens.length - 1]
    } else if (tokens.length === 1 && looksLikePath(tokens[0])) {
      path = tokens[0]
    }
    // No explicit path → fall back to the language (so ```html becomes /index.html).
    if (!path) path = langToPath(tokens[0]) ?? undefined
    if (!path) continue
    if (!path.startsWith('/')) path = '/' + path
    files.push({ path, code })
  }
  // Still nothing? Salvage a full HTML document written without a proper fence.
  if (!files.length) {
    const doc = markdown.match(/<!doctype html>[\s\S]*?<\/html>/i) || markdown.match(/<html[\s\S]*?<\/html>/i)
    if (doc) files.push({ path: '/index.html', code: doc[0] })
  }
  return files
}
