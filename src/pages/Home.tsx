import { Suspense, lazy, useEffect, useRef } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { PanelLeftOpen, PenSquare, ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import ChatView from '../components/ChatView'
import Settings from '../components/Settings'
import CommandPalette from '../components/CommandPalette'
import Spinner from '../components/ui/Spinner'
import { useStore } from '../store'
import { loadPendingRuns } from '../lib/pendingRuns'
import { useSwipeNav } from '../hooks/useSwipeNav'
import { useTabSwipe } from '../hooks/useTabSwipe'
import NativeTabBar from '../components/native/NativeTabBar'
import CallManager from '../components/CallManager'
import NotificationBell from '../components/NotificationBell'

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
const MessagesPage = lazy(() => import('./MessagesPage'))
const DMPage = lazy(() => import('./DMPage'))
const AgentDetailPage = lazy(() => import('./AgentDetailPage'))

export default function Home() {
  const { toggleSidebar, user } = useStore()
  // Native-style edge-swipe to open/close the sidebar on touch devices.
  useSwipeNav()
  // Native swipe-between-tabs (Home · Agents · Jobs · Friends).
  useTabSwipe()
  const navigate = useNavigate()
  const location = useLocation()
  // ChatView renders its own top bar; only the Projects view needs the
  // floating fallback controls when the sidebar is collapsed.
  const onProject = location.pathname.startsWith('/project')
  // Workspace pages render no top bar of their own — give them a back + menu.
  const onWorkspace = /^\/(agents|agent|jobs|apps|friends|messages|dm|tasks|team)\b/.test(location.pathname)

  // Animate transitions between SECTIONS, not every URL change — so navigating
  // within a chat (/chat → /c/:id while a reply streams) never remounts ChatView.
  const sectionKey =
    location.pathname === '/chat' || location.pathname.startsWith('/c/')
      ? 'chat'
      : location.pathname.startsWith('/project')
        ? 'project'
        : location.pathname

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
      <NotificationBell />
      <Sidebar />
      <main className="relative flex min-w-0 flex-1 flex-col">
        {/* In-flow sticky top bar for workspace/project routes. Sits ABOVE the
            routed content (not overlapping it), so page titles never get clipped
            by the menu/back buttons. Chat + Home render their own headers. The
            right side is left clear for the floating NotificationBell. */}
        {(onProject || onWorkspace) && (
          <div
            className="sticky top-0 z-30 flex items-center gap-1.5 border-b border-line/70 bg-[rgb(var(--surface)/0.82)] px-3 pb-2 backdrop-blur-xl"
            style={{ paddingTop: 'max(env(safe-area-inset-top), 0.6rem)' }}
          >
            <button onClick={() => navigate('/')} className="cg-iconbtn pressable !h-9 !min-w-9 rounded-full" title="Back home" aria-label="Back home">
              <ArrowLeft size={18} />
            </button>
            <button onClick={toggleSidebar} className="cg-iconbtn pressable !h-9 !min-w-9 rounded-full" title="Open menu" aria-label="Open menu">
              <PanelLeftOpen size={18} />
            </button>
            {onProject && (
              <button onClick={() => navigate('/chat')} className="cg-iconbtn pressable !h-9 !min-w-9 rounded-full" title="New chat" aria-label="New chat">
                <PenSquare size={18} />
              </button>
            )}
            {/* spacer keeps the bell (fixed, top-right) from sitting on the buttons */}
            <div className="flex-1" />
            <div className="h-9 w-11 shrink-0" aria-hidden />
          </div>
        )}

        <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={sectionKey}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="relative flex min-h-0 flex-1 flex-col"
        >
        <Routes location={location}>
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
          <Route
            path="/messages"
            element={
              <Suspense fallback={<div className="flex h-full items-center justify-center"><Spinner /></div>}>
                <MessagesPage />
              </Suspense>
            }
          />
          <Route
            path="/dm/:uid"
            element={
              <Suspense fallback={<div className="flex h-full items-center justify-center"><Spinner /></div>}>
                <DMPage />
              </Suspense>
            }
          />
          <Route path="*" element={<ChatView />} />
        </Routes>
        </motion.div>
        </AnimatePresence>
      </main>
      <Settings />
      <CommandPalette />
      <NativeTabBar />
    </div>
  )
}
