// RipoAI logo — the friendly robot character (static). Matches the animated
// Mascot that lives on the composer.
export default function Logo({ size = 32, glow = false }: { size?: number; glow?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={glow ? { filter: 'drop-shadow(0 6px 16px rgba(16,163,127,0.45))' } : undefined}
    >
      <defs>
        <linearGradient id="ripo-logo-grad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="#10a37f" />
          <stop offset="0.5" stopColor="#4ea8ff" />
          <stop offset="1" stopColor="#7c5cff" />
        </linearGradient>
      </defs>
      <line x1="32" y1="8" x2="32" y2="15" stroke="url(#ripo-logo-grad)" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="32" cy="7" r="3" fill="#36e0c0" />
      <rect x="12" y="15" width="40" height="36" rx="13" fill="url(#ripo-logo-grad)" />
      <rect x="17" y="21" width="30" height="22" rx="9" fill="#10121a" />
      <circle cx="25.5" cy="32" r="3.4" fill="#fff" />
      <circle cx="38.5" cy="32" r="3.4" fill="#fff" />
      <path d="M27 38 Q32 41 37 38" stroke="#36e0c0" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <rect x="20" y="50" width="8" height="5" rx="2.5" fill="url(#ripo-logo-grad)" />
      <rect x="36" y="50" width="8" height="5" rx="2.5" fill="url(#ripo-logo-grad)" />
    </svg>
  )
}
