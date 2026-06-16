import { Suspense, lazy, useEffect, useRef } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import { PanelLeftOpen, PenSquare } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import ChatView from '../components/ChatView'
import Settings from '../components/Settings'
import CommandPalette from '../components/CommandPalette'
import Spinner from '../components/ui/Spinner'
import { useStore } from '../store'
import { loadPendingRuns } from '../lib/pendingRuns'
import { useSwipeNav } from '../hooks/useSwipeNav'
import NativeTabBar from '../components/native/NativeTabBar'
import CallManager from '../components/CallManager'

// Sandpack is large — only load it when a project is opened.
const ProjectsView = lazy(() => import('../components/ProjectsView'))
const PlusPage = lazy(() => import('./PlusPage'))
const TasksPage = lazy(() => import('./TasksPage'))
const TeamPage = lazy(() => import('./TeamPage'))
const AdminPage = lazy(() => import('./AdminPage'))
const AgentsPage = lazy(() => import('./AgentsPage'))
const JobsPage = lazy(() => import('./JobsPage'))
const AppsPage = lazy(() => import('./AppsPage'))
const FriendsPage = lazy(() => import('./FriendsPage'))
const HomeLanding = lazy(() => import('./HomeLanding'))
const AgentDetailPage = lazy(() => import('./AgentDetailPage'))

export default function Home() {
  const { sidebarOpen, toggleSidebar, user } = useStore()
  // Native-style edge-swipe to open/close the sidebar on touch devices.
  useSwipeNav()
  const navigate = useNavigate()
  const location = useLocation()
  // ChatView renders its own top bar; only the Projects view needs the
  // floating fallback controls when the sidebar is collapsed.
  const onProject = location.pathname.startsWith('/project')

  // On a fresh open at the root, if a chat/agent task was interrupted by closing
  // the app, jump back into it so it resumes and finishes (handled in useChat).
  const checkedResume = useRef(false)
  useEffect(() => {
    if (checkedResume.current || !user) return
    checkedResume.current = true
    if (location.pathname !== '/') return
    const pending = loadPendingRuns(user.uid)
    if (pending.length) navigate(`/c/${pending[0].chatId}`, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  return (
    <div className="flex h-full w-full overflow-hidden">
      <CallManager />
      <Sidebar />
      <main className="relative flex min-w-0 flex-1 flex-col">
        {/* Floating controls when sidebar is collapsed (non-chat routes) */}
        {!sidebarOpen && onProject && (
          <div className="absolute left-3 top-3 z-20 flex gap-1 rounded-xl border border-[rgb(var(--line))] bg-[rgb(var(--surface))] p-1 shadow-sm dark:bg-[rgb(var(--surface-raised))]">
            <button
              onClick={toggleSidebar}
              className="cg-iconbtn pressable !h-9 !min-w-9"
              title="Open sidebar"
            >
              <PanelLeftOpen size={18} />
            </button>
            <button
              onClick={() => navigate('/chat')}
              className="cg-iconbtn pressable !h-9 !min-w-9"
              title="New chat"
            >
              <PenSquare size={18} />
            </button>
          </div>
        )}

        <Routes>
          <Route
            path="/"
            element={
              <Suspense fallback={<div className="flex h-full items-center justify-center"><Spinner /></div>}>
                <HomeLanding />
              </Suspense>
            }
          />
          <Route path="/chat" element={<ChatView />} />
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
          <Route
            path="/plus"
            element={
              <Suspense fallback={<div className="flex h-full items-center justify-center"><Spinner /></div>}>
                <PlusPage />
              </Suspense>
            }
          />
          <Route
            path="/tasks"
            element={
              <Suspense fallback={<div className="flex h-full items-center justify-center"><Spinner /></div>}>
                <TasksPage />
              </Suspense>
            }
          />
          <Route
            path="/team"
            element={
              <Suspense fallback={<div className="flex h-full items-center justify-center"><Spinner /></div>}>
                <TeamPage />
              </Suspense>
            }
          />
          <Route
            path="/admin"
            element={
              <Suspense fallback={<div className="flex h-full items-center justify-center"><Spinner /></div>}>
                <AdminPage />
              </Suspense>
            }
          />
          <Route
            path="/agents"
            element={
              <Suspense fallback={<div className="flex h-full items-center justify-center"><Spinner /></div>}>
                <AgentsPage />
              </Suspense>
            }
          />
          <Route
            path="/agent/:agentId"
            element={
              <Suspense fallback={<div className="flex h-full items-center justify-center"><Spinner /></div>}>
                <AgentDetailPage />
              </Suspense>
            }
          />
          <Route
            path="/jobs"
            element={
              <Suspense fallback={<div className="flex h-full items-center justify-center"><Spinner /></div>}>
                <JobsPage />
              </Suspense>
            }
          />
          <Route
            path="/apps"
            element={
              <Suspense fallback={<div className="flex h-full items-center justify-center"><Spinner /></div>}>
                <AppsPage />
              </Suspense>
            }
          />
          <Route
            path="/friends"
            element={
              <Suspense fallback={<div className="flex h-full items-center justify-center"><Spinner /></div>}>
                <FriendsPage />
              </Suspense>
            }
          />
          <Route path="*" element={<ChatView />} />
        </Routes>
      </main>
      <Settings />
      <CommandPalette />
      <NativeTabBar />
    </div>
  )
}
