interface Props {
  onClick: () => void
  disabled?: boolean
  label: string
}

export default function GoogleButton({ onClick, disabled, label }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="pressable flex w-full items-center justify-center gap-3 rounded-2xl border border-white/15 bg-white/80 py-3 font-semibold text-neutral-800 shadow-sm transition hover:bg-white disabled:opacity-50 dark:bg-white/90"
    >
      <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35 24 35c-6.1 0-11-4.9-11-11s4.9-11 11-11c2.8 0 5.4 1.1 7.3 2.8l5.7-5.7C33.6 6.1 29.1 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 19.7-8 19.7-20 0-1.2-.1-2.3-.4-3.5z" />
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c2.8 0 5.4 1.1 7.3 2.8l5.7-5.7C33.6 6.1 29.1 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35 26.7 36 24 36c-5.3 0-9.7-3.6-11.3-8.5l-6.5 5C9.6 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C41.9 35.7 44 30.4 44 24c0-1.2-.1-2.3-.4-3.5z" />
      </svg>
      {label}
    </button>
  )
}
