import { forwardRef } from 'react'
import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'ghost' | 'glass' | 'danger'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
}

const variants: Record<Variant, string> = {
  primary:
    'btn-sheen accent-gradient-bg text-white shadow-lg shadow-accent/30 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-accent/40',
  ghost: 'text-ink/80 hover:bg-ink/5 dark:hover:bg-white/5',
  glass: 'glass text-ink hover:brightness-105 hover:-translate-y-0.5',
  danger: 'bg-red-500/90 text-white hover:bg-red-500 hover:-translate-y-0.5',
}

const Button = forwardRef<HTMLButtonElement, Props>(
  ({ variant = 'primary', className = '', ...props }, ref) => (
    <button
      ref={ref}
      className={`pressable inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    />
  ),
)
Button.displayName = 'Button'
export default Button
