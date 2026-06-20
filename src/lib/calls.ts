// Peer-to-peer voice + video calls over WebRTC, signaled through Firestore.
// No media server or OAuth needed — just public STUN. (A TURN server would be
// needed for calls across strict/symmetric NATs, which requires infra; STUN
// covers most home/mobile networks.)
import {
  doc,
  setDoc,
  updateDoc,
  getDoc,
  onSnapshot,
  collection,
  addDoc,
  query,
  where,
  deleteDoc,
} from 'firebase/firestore'
import { db } from '../firebase'

export type CallKind = 'audio' | 'video'
export type CallState = 'ringing' | 'active' | 'ended'

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
}

export interface IncomingCall {
  id: string
  caller: string
  callerName: string
  kind: CallKind
}

/** A live call. The UI binds local/remote streams and calls `end()` to hang up. */
export class CallSession {
  pc: RTCPeerConnection
  callId: string
  kind: CallKind
  local: MediaStream | null = null
  remote = new MediaStream()
  onRemote: (s: MediaStream) => void = () => {}
  onState: (s: CallState) => void = () => {}
  private unsubs: Array<() => void> = []
  private ended = false

  constructor(callId: string, kind: CallKind) {
    this.pc = new RTCPeerConnection(RTC_CONFIG)
    this.callId = callId
    this.kind = kind
    this.pc.ontrack = (e) => {
      e.streams[0]?.getTracks().forEach((t) => this.remote.addTrack(t))
      this.onRemote(this.remote)
    }
    this.pc.onconnectionstatechange = () => {
      if (['disconnected', 'failed', 'closed'].includes(this.pc.connectionState)) this.onState('ended')
      else if (this.pc.connectionState === 'connected') this.onState('active')
    }
  }

  async startLocal() {
    this.local = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: this.kind === 'video' ? { facingMode: 'user' } : false,
    })
    this.local.getTracks().forEach((t) => this.pc.addTrack(t, this.local!))
  }

  toggleMute(): boolean {
    const track = this.local?.getAudioTracks()[0]
    if (!track) return false
    track.enabled = !track.enabled
    return !track.enabled // returns "muted"
  }

  toggleCamera(): boolean {
    const track = this.local?.getVideoTracks()[0]
    if (!track) return false
    track.enabled = !track.enabled
    return !track.enabled // returns "camera off"
  }

  track(u: () => void) {
    this.unsubs.push(u)
  }

  async end() {
    if (this.ended) return
    this.ended = true
    this.unsubs.forEach((u) => u())
    this.local?.getTracks().forEach((t) => t.stop())
    try {
      this.pc.close()
    } catch {
      /* ignore */
    }
    this.onState('ended')
    try {
      await updateDoc(doc(db, 'calls', this.callId), { status: 'ended' })
    } catch {
      /* ignore */
    }
  }
}

/** Caller: create the offer + signaling doc and wait for an answer. */
export async function startCall(
  me: { uid: string; name: string },
  other: { uid: string; name: string },
  kind: CallKind,
): Promise<CallSession> {
  const callRef = doc(collection(db, 'calls'))
  const s = new CallSession(callRef.id, kind)
  await s.startLocal()

  const callerCandidates = collection(callRef, 'callerCandidates')
  s.pc.onicecandidate = (e) => {
    if (e.candidate) void addDoc(callerCandidates, e.candidate.toJSON())
  }

  const offer = await s.pc.createOffer()
  await s.pc.setLocalDescription(offer)
  await setDoc(callRef, {
    caller: me.uid,
    callerName: me.name,
    callee: other.uid,
    calleeName: other.name,
    kind,
    status: 'ringing' as CallState,
    offer: { type: offer.type, sdp: offer.sdp },
    ts: Date.now(),
  })

  // Listen for the answer + end state.
  s.track(
    onSnapshot(callRef, (snap) => {
      const d = snap.data()
      if (!d) return
      if (d.answer && !s.pc.currentRemoteDescription) {
        void s.pc.setRemoteDescription(new RTCSessionDescription(d.answer))
      }
      if (d.status === 'ended') void s.end()
    }),
  )
  // Remote ICE candidates from the callee.
  s.track(
    onSnapshot(collection(callRef, 'calleeCandidates'), (snap) => {
      snap.docChanges().forEach((c) => {
        if (c.type === 'added') void s.pc.addIceCandidate(new RTCIceCandidate(c.doc.data()))
      })
    }),
  )
  return s
}

/** Callee: answer an incoming call by id. */
export async function answerCall(callId: string): Promise<CallSession> {
  const callRef = doc(db, 'calls', callId)
  const snap = await getDoc(callRef)
  const data = snap.data()
  if (!data) throw new Error('Call no longer exists')
  const s = new CallSession(callId, data.kind as CallKind)
  await s.startLocal()

  const calleeCandidates = collection(callRef, 'calleeCandidates')
  s.pc.onicecandidate = (e) => {
    if (e.candidate) void addDoc(calleeCandidates, e.candidate.toJSON())
  }

  await s.pc.setRemoteDescription(new RTCSessionDescription(data.offer))
  const answer = await s.pc.createAnswer()
  await s.pc.setLocalDescription(answer)
  await updateDoc(callRef, { answer: { type: answer.type, sdp: answer.sdp }, status: 'active' })

  s.track(
    onSnapshot(collection(callRef, 'callerCandidates'), (snap2) => {
      snap2.docChanges().forEach((c) => {
        if (c.type === 'added') void s.pc.addIceCandidate(new RTCIceCandidate(c.doc.data()))
      })
    }),
  )
  s.track(
    onSnapshot(callRef, (snap2) => {
      if (snap2.data()?.status === 'ended') void s.end()
    }),
  )
  return s
}

/** Listen for incoming ringing calls addressed to me. */
export function watchIncomingCalls(uid: string, cb: (call: IncomingCall | null) => void): () => void {
  const q = query(collection(db, 'calls'), where('callee', '==', uid), where('status', '==', 'ringing'))
  return onSnapshot(q, (snap) => {
    const d = snap.docs[0]
    if (!d) return cb(null)
    const data = d.data()
    cb({ id: d.id, caller: data.caller, callerName: data.callerName || 'Caller', kind: data.kind })
  })
}

export async function declineCall(callId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'calls', callId), { status: 'ended' })
  } catch {
    /* ignore */
  }
}

export async function cleanupCall(callId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'calls', callId))
  } catch {
    /* ignore */
  }
}
