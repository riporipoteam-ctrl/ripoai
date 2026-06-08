// AskAI logo — an interwoven six-fold knot (in the spirit of a premium AI mark):
// three rounded "ribbon" loops woven at 0°/60°/120° into a blossom/rosette. It is
// strictly monochrome and follows the theme accent (mono in ChatGPT mode), so it
// never introduces stray colors. `mark` = the knot on its own; `icon` = the knot
// inside a rounded app tile.
export default function Logo({
  size = 32,
  glow = false,
  variant = 'mark',
}: {
  size?: number
  glow?: boolean
  variant?: 'mark' | 'icon'
}) {
  const stroke = variant === 'icon' ? 'rgb(var(--accent-ink, 255 255 255))' : 'rgb(var(--accent))'

  // One woven ribbon loop, drawn three times rotated by 60°.
  const Loops = ({ w }: { w: number }) => (
    <g
      fill="none"
      stroke={stroke}
      strokeWidth={w}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {[0, 60, 120].map((deg) => (
        <rect key={deg} x="11" y="20" width="42" height="24" rx="12" transform={`rotate(${deg} 32 32)`} />
      ))}
    </g>
  )

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={glow ? { filter: 'drop-shadow(0 6px 18px rgb(var(--accent) / 0.4))' } : undefined}
    >
      {variant === 'icon' ? (
        <>
          <rect x="3" y="3" width="58" height="58" rx="16" fill="rgb(var(--accent))" />
          {/* subtle top sheen for the liquid-glass tile */}
          <rect x="3" y="3" width="58" height="28" rx="14" fill="#ffffff" opacity="0.08" />
          <Loops w={4.6} />
        </>
      ) : (
        <Loops w={5.2} />
      )}
    </svg>
  )
}
