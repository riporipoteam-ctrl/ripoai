import type { Project } from './db'

export function newReactProject(name: string): Project {
  const id = crypto.randomUUID()
  return {
    id,
    name,
    description: '',
    template: 'react',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    files: {
      '/App.js': `export default function App() {
  return (
    <div style={{
      fontFamily: 'system-ui, sans-serif',
      minHeight: '100vh',
      display: 'grid',
      placeItems: 'center',
      background: 'linear-gradient(120deg,#7c5cff,#4ea8ff,#36e0c0)',
      color: 'white'
    }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: 48, margin: 0 }}>Hello from RipoAI 👋</h1>
        <p style={{ opacity: 0.9 }}>Ask the agent on the left to build something.</p>
      </div>
    </div>
  );
}
`,
    },
  }
}
