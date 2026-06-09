// AskAI logo — a three-blade pinwheel swirling around a four-point star, matching
// the brand mark. `mark` renders in the theme accent (mono) so it sits inline in
// any theme; `icon` renders the glossy black mark on a white app tile (the actual
// app-icon look). Blades are one path rotated 0/120/240°.
const BLADE =
  'M30 8 C41 8.5 50 15 52.5 27.5 C50.5 20.5 44 16.5 36 18 C34.5 14.5 32.5 11 30 8 Z'
const STAR =
  'M32 22 C33 28.5 35.8 31 42 32 C35.8 33 33 35.8 32 42 C31 35.8 28.2 33 22 32 C28.2 31 31 28.5 32 22 Z'

export default function Logo({
  size = 32,
  glow = false,
  variant = 'mark',
}: {
  size?: number
  glow?: boolean
  variant?: 'mark' | 'icon'
}) {
  const uid = Math.random().toString(36).slice(2, 8)
  const fill = variant === 'icon' ? `url(#g-${uid})` : 'rgb(var(--accent))'

  const Mark = () => (
    <g fill={fill}>
      <path d={BLADE} transform="rotate(0 32 32)" />
      <path d={BLADE} transform="rotate(120 32 32)" />
      <path d={BLADE} transform="rotate(240 32 32)" />
      <path d={STAR} />
    </g>
  )

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={glow ? { filter: 'drop-shadow(0 8px 22px rgb(var(--ink) / 0.35))' } : undefined}
    >
      <defs>
        {/* Glossy black gradient for the app-tile variant */}
        <linearGradient id={`g-${uid}`} x1="20" y1="10" x2="44" y2="54" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2a2a2e" />
          <stop offset="0.5" stopColor="#0b0b0d" />
          <stop offset="1" stopColor="#1a1a1d" />
        </linearGradient>
      </defs>

      {variant === 'icon' ? (
        <>
          <rect x="3" y="3" width="58" height="58" rx="16" fill="#ffffff" />
          <rect x="3" y="3" width="58" height="28" rx="14" fill="#000000" opacity="0.04" />
          <Mark />
        </>
      ) : (
        <Mark />
      )}
    </svg>
  )
}
