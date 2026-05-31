export default function Spinner({ size = 22 }: { size?: number }) {
  return (
    <div
      className="animate-spin rounded-full border-2 border-muted/30 border-t-accent"
      style={{ width: size, height: size }}
      role="status"
      aria-label="Loading"
    />
  )
}
