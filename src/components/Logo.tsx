// AskAI logo — an iOS-26 "Liquid Glass" mark: a glossy squircle of fluid light
// with a soft inner spark. `variant="mark"` renders the floating glass blob
// (for inline use next to the wordmark); `variant="icon"` renders the full
// rounded app-icon tile. Both adapt to the active accent via CSS vars.
export default function Logo({
  size = 32,
  glow = false,
  variant = 'mark',
}: {
  size?: number
  glow?: boolean
  variant?: 'mark' | 'icon'
}) {
  // A fluid, asymmetric "A"-spark path — the AskAI signature glyph.
  const spark =
    'M32 9 C35 22, 42 29, 55 32 C42 35, 35 42, 32 55 C29 42, 22 35, 9 32 C22 29, 29 22, 32 9 Z'

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={glow ? { filter: 'drop-shadow(0 10px 26px rgb(var(--accent) / 0.5))' } : undefined}
    >
      <defs>
        <linearGradient id="askai-grad" x1="6" y1="4" x2="58" y2="62" gradientUnits="userSpaceOnUse">
          <stop stopColor="rgb(var(--accent))" />
          <stop offset="1" stopColor="rgb(var(--accent) / 0.66)" />
        </linearGradient>
        {/* Liquid-glass top highlight */}
        <radialGradient id="askai-gloss" cx="0.32" cy="0.24" r="0.9">
          <stop stopColor="#ffffff" stopOpacity="0.85" />
          <stop offset="0.34" stopColor="#ffffff" stopOpacity="0.16" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="askai-sheen" x1="0" y1="0" x2="0" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" stopOpacity="0.5" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {variant === 'icon' ? (
        <>
          {/* Squircle tile */}
          <rect x="3" y="3" width="58" height="58" rx="17" fill="url(#askai-grad)" />
          <rect x="3" y="3" width="58" height="58" rx="17" fill="url(#askai-gloss)" />
          <rect
            x="3.75"
            y="3.75"
            width="56.5"
            height="56.5"
            rx="16.25"
            fill="none"
            stroke="#ffffff"
            strokeOpacity="0.35"
            strokeWidth="1.2"
          />
          <g transform="translate(11 11) scale(0.66)">
            <path d={spark} fill="#fff" />
          </g>
        </>
      ) : (
        <>
          {/* Floating liquid-glass blob */}
          <rect x="4" y="4" width="56" height="56" rx="20" fill="url(#askai-grad)" />
          <rect x="4" y="4" width="56" height="56" rx="20" fill="url(#askai-gloss)" />
          <rect x="4" y="4" width="56" height="28" rx="14" fill="url(#askai-sheen)" />
          <rect
            x="4.6"
            y="4.6"
            width="54.8"
            height="54.8"
            rx="19.4"
            fill="none"
            stroke="#ffffff"
            strokeOpacity="0.4"
            strokeWidth="1.1"
          />
          <g transform="translate(11 11) scale(0.66)">
            <path d={spark} fill="#fff" fillOpacity="0.95" />
          </g>
        </>
      )}
    </svg>
  )
}
