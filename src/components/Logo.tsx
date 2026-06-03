// RipoAI logo — a clean, premium "spark" mark in the warm brand gradient.
// `variant="mark"` renders just the gradient sparkle (for inline use next to the
// wordmark); `variant="icon"` renders the rounded gradient tile with a white
// sparkle (app-icon / standalone use).
export default function Logo({
  size = 32,
  glow = false,
  variant = 'mark',
}: {
  size?: number
  glow?: boolean
  variant?: 'mark' | 'icon'
}) {
  const sparkle =
    'M32 7 C34.5 23, 41 29.5, 57 32 C41 34.5, 34.5 41, 32 57 C29.5 41, 23 34.5, 7 32 C23 29.5, 29.5 23, 32 7 Z'
  const mini =
    'M48 11 C49 16.5, 51.5 19, 57 20 C51.5 21, 49 23.5, 48 29 C47 23.5, 44.5 21, 39 20 C44.5 19, 47 16.5, 48 11 Z'

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={glow ? { filter: 'drop-shadow(0 8px 20px rgba(217,119,87,0.45))' } : undefined}
    >
      <defs>
        <linearGradient id="ripo-grad" x1="4" y1="4" x2="60" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#e0935f" />
          <stop offset="0.5" stopColor="#d97757" />
          <stop offset="1" stopColor="#c25d3f" />
        </linearGradient>
      </defs>
      {variant === 'icon' ? (
        <>
          <rect x="4" y="4" width="56" height="56" rx="16" fill="url(#ripo-grad)" />
          <g transform="translate(11 11) scale(0.66)">
            <path d={sparkle} fill="#fff" />
          </g>
        </>
      ) : (
        <>
          <path d={sparkle} fill="url(#ripo-grad)" />
          <path d={mini} fill="url(#ripo-grad)" opacity="0.85" />
        </>
      )}
    </svg>
  )
}
