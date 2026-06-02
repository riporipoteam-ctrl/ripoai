import { Suspense, lazy } from 'react'
import { Routes, Route } from 'react-router-dom'
import { PanelLeftOpen, PenSquare } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import ChatView from '../components/ChatView'
import Settings from '../components/Settings'
import CommandPalette from '../components/CommandPalette'
import Spinner from '../components/ui/Spinner'
import { useStore } from '../store'

// Sandpack is large — only load it when a project is opened.
const ProjectsView = lazy(() => import('../components/ProjectsView'))

export default function Home() {
  const { sidebarOpen, toggleSidebar } = useStore()
  const navigate = useNavigate()

  return (
    <div className="flex h-full w-full overflow-hidden">
      <Sidebar />
      <main className="relative flex min-w-0 flex-1 flex-col">
        {/* Floating controls when sidebar is collapsed */}
        {!sidebarOpen && (
          <div className="absolute left-3 top-3 z-20 flex gap-1">
            <button
              onClick={toggleSidebar}
              className="glass pressable rounded-xl p-2 text-ink hover:brightness-110"
              title="Open sidebar"
            >
              <PanelLeftOpen size={18} />
            </button>
            <button
              onClick={() => navigate('/')}
              className="glass pressable rounded-xl p-2 text-ink hover:brightness-110"
              title="New chat"
            >
              <PenSquare size={18} />
            </button>
          </div>
        )}

        <Routes>
          <Route path="/" element={<ChatView />} />
          <Route path="/c/:chatId" element={<ChatView />} />
          <Route
            path="/project/:projectId"
            element={
              <Suspense
                fallback={
                  <div className="flex h-full items-center justify-center">
                    <Spinner />
                  </div>
                }
              >
                <ProjectsView />
              </Suspense>
            }
          />
          <Route path="*" element={<ChatView />} />
        </Routes>
      </main>
      <Settings />
      <CommandPalette />
    </div>
  )
}
