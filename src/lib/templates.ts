import type { Project } from './db'

export function newReactProject(name: string): Project {
  const id = crypto.randomUUID()
  return {
    id,
    name,
    description: '',
    template: 'static',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    files: {
      '/index.html': `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>My App</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; font-family: system-ui, sans-serif; }
    body { min-height: 100vh; display: grid; place-items: center;
      background: linear-gradient(120deg,#7c5cff,#4ea8ff,#36e0c0); color: #fff; text-align: center; }
    h1 { font-size: clamp(2rem, 6vw, 3.5rem); }
    p { opacity: .9; margin-top: .5rem; }
  </style>
</head>
<body>
  <div>
    <h1>Hello from AskAI 👋</h1>
    <p>Ask the agent on the left to build something amazing.</p>
  </div>
</body>
</html>
`,
    },
  }
}
