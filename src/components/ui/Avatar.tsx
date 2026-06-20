interface Props {
  name?: string | null
  photoURL?: string | null
  size?: number
}

export default function Avatar({ name, photoURL, size = 32 }: Props) {
  const initial = (name?.trim()?.[0] ?? 'R').toUpperCase()
  if (photoURL) {
    return (
      <img
        src={photoURL}
        alt={name ?? 'User'}
        referrerPolicy="no-referrer"
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <div
      className="accent-gradient-bg flex items-center justify-center rounded-full font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {initial}
    </div>
  )
}
