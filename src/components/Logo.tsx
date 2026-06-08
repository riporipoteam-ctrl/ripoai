// AskAI logo — an iOS-26 "Liquid Glass" orb. A vibrant, glossy gradient squircle
// with a fluid light-blob highlight and a soft inner "spark" droplet. The brand
// gradient is fixed (indigo → violet → cyan) so the mark stays colorful and
// distinctive in every theme, with real depth (gloss, rim-light, inner shadow).
export default function Logo({
  size = 32,
  glow = false,
  variant = 'mark',
}: {
  size?: number
  glow?: boolean
  variant?: 'mark' | 'icon'
}) {
  // Stable per-instance ids so multiple logos on one page don't clash.
  const uid = Math.random().toString(36).slice(2, 8)
  const g = (n: string) => `${n}-${uid}`

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={glow ? { filter: 'drop-shadow(0 12px 28px rgba(124,92,255,0.55))' } : undefined}
    >
      <defs>
        {/* Vibrant brand gradient — fixed, theme-independent */}
        <linearGradient id={g('grad')} x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6366f1" />
          <stop offset="0.5" stopColor="#a855f7" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
        {/* Glossy top highlight */}
        <radialGradient id={g('gloss')} cx="0.34" cy="0.22" r="0.85">
          <stop stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="0.4" stopColor="#ffffff" stopOpacity="0.18" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        {/* Inner droplet gradient */}
        <linearGradient id={g('drop')} x1="22" y1="18" x2="42" y2="46" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" />
          <stop offset="1" stopColor="#e8e2ff" />
        </linearGradient>
        <linearGradient id={g('rim')} x1="0" y1="0" x2="0" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" stopOpacity="0.7" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Squircle body */}
      <rect x="3" y="3" width="58" height="58" rx={variant === 'icon' ? 17 : 19} fill={`url(#${g('grad')})`} />
      {/* Gloss + rim light */}
      <rect x="3" y="3" width="58" height="58" rx={variant === 'icon' ? 17 : 19} fill={`url(#${g('gloss')})`} />
      <rect x="3" y="3" width="58" height="29" rx={variant === 'icon' ? 15 : 17} fill={`url(#${g('rim')})`} opacity="0.8" />
      <rect
        x="3.8"
        y="3.8"
        width="56.4"
        height="56.4"
        rx={variant === 'icon' ? 16.2 : 18.2}
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.45"
        strokeWidth="1.1"
      />

      {/* Liquid "A" droplet mark — an abstract fluid form, not a sparkle */}
      <path
        d="M32 17 C33 26 38 31 47 33 C39 34 34 38 32.6 45.5 C32.3 47 31.7 47 31.4 45.5 C30 38 25 34 17 33 C26 31 31 26 32 17 Z"
        fill={`url(#${g('drop')})`}
        opacity="0.96"
      />
      {/* Tiny accent bubble for extra "liquid" feel */}
      <circle cx="43" cy="22" r="3.4" fill="#ffffff" opacity="0.9" />
      <circle cx="43" cy="22" r="3.4" fill={`url(#${g('gloss')})`} />
    </svg>
  )
}
