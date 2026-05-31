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
    if (!path) continue
    if (!path.startsWith('/')) path = '/' + path
    files.push({ path, code })
  }
  return files
}
