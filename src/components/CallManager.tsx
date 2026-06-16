// Global call manager — handles BOTH outgoing calls (fired via the
// `askai-start-call` window event from a chat) and incoming calls (Firestore
// listener). Renders the full-screen in-call UI and the incoming ring. Mounted
// once, app-wide, in Home.
import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Phone, PhoneOff, Video, Mic, MicOff, VideoOff } from 'lucide-react'
import { useStore } from '../store'
import {
  startCall,
  answerCall,
  watchIncomingCalls,
  declineCall,
  CallSession,
  type CallKind,
  type IncomingCall,
} from '../lib/calls'

interface StartDetail {
  other: { uid: string; name: string }
  kind: CallKind
}

export default function CallManager() {
  const user = useStore((s) => s.user)
  const [session, setSession] = useState<CallSession | null>(null)
  const [incoming, setIncoming] = useState<IncomingCall | null>(null)
  const [status, setStatus] = useState<'calling' | 'active' | 'ended'>('calling')

  // Outgoing: a chat dispatches askai-start-call.
  useEffect(() => {
    if (!user) return
    async function onStart(e: Event) {
      const { other, kind } = (e as CustomEvent<StartDetail>).detail
      try {
        const s = await startCall({ uid: user!.uid, name: user!.displayName || 'You' }, other, kind)
        setStatus('calling')
        s.onState = (st) => setStatus(st === 'active' ? 'active' : st === 'ended' ? 'ended' : 'calling')
        setSession(s)
      } catch {
        alert('Could not access your microphone/camera.')
      }
    }
    window.addEventListener('askai-start-call', onStart as EventListener)
    return () => window.removeEventListener('askai-start-call', onStart as EventListener)
  }, [user])

  // Incoming ring.
  useEffect(() => {
    if (!user) return
    return watchIncomingCalls(user.uid, (call) => setIncoming(session ? null : call))
  }, [user, session])

  async function accept() {
    if (!incoming) return
    try {
      const s = await answerCall(incoming.id)
      setStatus('active')
      s.onState = (st) => setStatus(st === 'ended' ? 'ended' : 'active')
      setSession(s)
      setIncoming(null)
    } catch {
      setIncoming(null)
    }
  }

  function dismiss() {
    if (incoming) void declineCall(incoming.id)
    setIncoming(null)
  }

  function hangup() {
    void session?.end()
    setSession(null)
    setStatus('calling')
  }

  useEffect(() => {
    if (status === 'ended') {
      const t = setTimeout(() => {
        setSession(null)
        setStatus('calling')
      }, 1200)
      return () => clearTimeout(t)
    }
  }, [status])

  return (
    <>
      <AnimatePresence>
        {incoming && !session && (
          <motion.div
            initial={{ opacity: 0, y: -40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -40 }}
            className="fixed inset-x-0 top-4 z-[200] mx-auto flex max-w-sm items-center gap-3 rounded-2xl border border-line bg-card p-3 shadow-2xl"
            style={{ left: 0, right: 0 }}
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-lg font-bold text-accent">
              {incoming.callerName.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-ink">{incoming.callerName}</div>
              <div className="text-xs text-muted">Incoming {incoming.kind} call…</div>
            </div>
            <button onClick={accept} className="pressable flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500 text-white">
              <Phone size={18} />
            </button>
            <button onClick={dismiss} className="pressable flex h-11 w-11 items-center justify-center rounded-full bg-red-500 text-white">
              <PhoneOff size={18} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>{session && <InCall session={session} status={status} onHangup={hangup} />}</AnimatePresence>
    </>
  )
}

function InCall({ session, status, onHangup }: { session: CallSession; status: string; onHangup: () => void }) {
  const localRef = useRef<HTMLVideoElement>(null)
  const remoteRef = useRef<HTMLVideoElement>(null)
  const [muted, setMuted] = useState(false)
  const [camOff, setCamOff] = useState(false)
  const isVideo = session.kind === 'video'

  useEffect(() => {
    if (session.local && localRef.current) localRef.current.srcObject = session.local
    session.onRemote = (s) => {
      if (remoteRef.current) remoteRef.current.srcObject = s
    }
    if (remoteRef.current) remoteRef.current.srcObject = session.remote
  }, [session])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[210] flex flex-col bg-neutral-900 text-white"
    >
      {/* Remote */}
      <div className="relative flex-1 overflow-hidden">
        {isVideo ? (
          <video ref={remoteRef} autoPlay playsInline className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <div className="flex h-28 w-28 items-center justify-center rounded-full bg-white/10 text-5xl">🎧</div>
            <div className="text-lg font-semibold">Voice call</div>
          </div>
        )}
        <div className="absolute left-0 right-0 top-6 text-center text-sm text-white/80">
          {status === 'active' ? 'Connected' : status === 'ended' ? 'Call ended' : 'Calling…'}
        </div>
        {/* Local PiP */}
        {isVideo && (
          <video
            ref={localRef}
            autoPlay
            playsInline
            muted
            className="absolute bottom-28 right-4 h-40 w-28 rounded-xl border border-white/20 object-cover shadow-lg"
          />
        )}
        {!isVideo && <audio ref={localRef as unknown as React.RefObject<HTMLAudioElement>} autoPlay muted className="hidden" />}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-5 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-4">
        <button
          onClick={() => setMuted(session.toggleMute())}
          className={`flex h-14 w-14 items-center justify-center rounded-full ${muted ? 'bg-white text-neutral-900' : 'bg-white/15'}`}
        >
          {muted ? <MicOff size={22} /> : <Mic size={22} />}
        </button>
        <button onClick={onHangup} className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500">
          <PhoneOff size={26} />
        </button>
        {isVideo && (
          <button
            onClick={() => setCamOff(session.toggleCamera())}
            className={`flex h-14 w-14 items-center justify-center rounded-full ${camOff ? 'bg-white text-neutral-900' : 'bg-white/15'}`}
          >
            {camOff ? <VideoOff size={22} /> : <Video size={22} />}
          </button>
        )}
      </div>
    </motion.div>
  )
}
