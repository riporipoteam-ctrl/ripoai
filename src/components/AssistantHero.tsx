import { useEffect, useRef } from 'react'
import lottie, { type AnimationItem } from 'lottie-web'
import animationData from '../assets/assistant.json'

// RipoAI's animated assistant — a real Lottie (After Effects) animation rather
// than a hand-drawn SVG, so the motion is smooth and professional. Rendered via
// lottie-web directly (no wrapper) and cleaned up on unmount.
export default function AssistantHero({ size = 180, loop = true }: { size?: number; loop?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    const anim: AnimationItem = lottie.loadAnimation({
      container: ref.current,
      renderer: 'svg',
      loop,
      autoplay: true,
      animationData: animationData as unknown as object,
      rendererSettings: { progressiveLoad: true },
    })
    return () => anim.destroy()
  }, [loop])

  return <div ref={ref} style={{ width: size, height: size }} aria-hidden />
}
