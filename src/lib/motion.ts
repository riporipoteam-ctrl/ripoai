import type { Variants } from 'framer-motion'

export const spring = { type: 'spring', stiffness: 260, damping: 24, mass: 0.8 } as const
export const softSpring = { type: 'spring', stiffness: 180, damping: 22, mass: 0.9 } as const

export const fadeUp: Variants = {
  initial: { opacity: 0, y: 12, filter: 'blur(8px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)', transition: softSpring },
  exit: { opacity: 0, y: 8, filter: 'blur(8px)', transition: { duration: 0.16 } },
}

export const scalePop: Variants = {
  initial: { opacity: 0, scale: 0.92 },
  animate: { opacity: 1, scale: 1, transition: spring },
  exit: { opacity: 0, scale: 0.96, transition: { duration: 0.14 } },
}

export const sheet: Variants = {
  initial: { opacity: 0, y: 18, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: softSpring },
  exit: { opacity: 0, y: 12, scale: 0.98, transition: { duration: 0.16 } },
}

export const listStagger: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.045, delayChildren: 0.04 } },
}

export const imageReveal: Variants = {
  initial: { opacity: 0, scale: 1.025, filter: 'saturate(0.85) blur(6px)' },
  animate: { opacity: 1, scale: 1, filter: 'saturate(1) blur(0px)' },
}
