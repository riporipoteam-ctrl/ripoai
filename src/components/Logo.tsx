// AskAI logo — renders the real brand image (high-res) as a rounded badge, so it
// is pixel-faithful and crisp everywhere it appears. `icon` = app-tile rounding,
// `mark` = a slightly tighter inline badge.
import logoUrl from '../assets/askai-logo.png'

export default function Logo({
  size = 32,
  glow = false,
  variant = 'mark',
}: {
  size?: number
  glow?: boolean
  variant?: 'mark' | 'icon'
}) {
  const radius = Math.round(size * (variant === 'icon' ? 0.26 : 0.28))
  return (
    <img
      src={logoUrl}
      alt="AskAI"
      width={size}
      height={size}
      draggable={false}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        objectFit: 'cover',
        display: 'block',
        boxShadow: glow ? '0 14px 34px -10px rgba(0,0,0,0.45)' : undefined,
      }}
    />
  )
}
