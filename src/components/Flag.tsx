import { useState } from 'react'
import { flagCode, flagSrcSet, flagUrl } from '../lib/flags'

/**
 * A flag that renders on every device. Resolves the team/country name to a real
 * flag image (flagcdn.com); if the name is unknown OR the image fails to load,
 * it falls back to the emoji flag, then to a neutral globe — never a blank box.
 */
export default function Flag({
  name,
  emoji,
  size = 22,
  className = '',
}: {
  name?: string
  emoji?: string
  size?: number
  className?: string
}) {
  const code = flagCode(name)
  const [imgFailed, setImgFailed] = useState(false)

  // Rounded "pill" flag — width:height ≈ 4:3 looks crisp at small sizes.
  const h = Math.round(size * 0.72)

  if (code && !imgFailed) {
    return (
      <img
        src={flagUrl(code, 80)}
        srcSet={flagSrcSet(code, 40)}
        alt=""
        width={size}
        height={h}
        loading="lazy"
        onError={() => setImgFailed(true)}
        className={`inline-block shrink-0 rounded-[3px] object-cover shadow-sm ring-1 ring-black/10 ${className}`}
        style={{ width: size, height: h }}
      />
    )
  }

  // Fallback: emoji flag (works on iOS/macOS), else a neutral globe.
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center leading-none ${className}`}
      style={{ fontSize: size * 0.92, width: size, height: h }}
    >
      {emoji || '🏳️'}
    </span>
  )
}
