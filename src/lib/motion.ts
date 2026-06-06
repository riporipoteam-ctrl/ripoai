import { useMemo } from 'react'
import { type Transition, type Variants, useReducedMotion } from 'framer-motion'

export const springTransition: Transition = { type: 'spring', stiffness: 300, damping: 24 }
export const softSpringTransition: Transition = { type: 'spring', stiffness: 200, damping: 18 }
export const sheetTransition: Transition = { type: 'spring', stiffness: 360, damping: 34 }
export const fadeTransition: Transition = { duration: 0.2, ease: 'easeOut' }
export const imageLoadTransition: Transition = { duration: 0.5, ease: 'easeOut' }

export const reducedTransition: Transition = { duration: 0 }

export function reducedMotionSafeTransition(prefersReducedMotion: boolean, transition: Transition): Transition {
  return prefersReducedMotion ? reducedTransition : transition
}

export const fadeUpVariants: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 8 },
}

export const reducedFadeUpVariants: Variants = {
  initial: { opacity: 0, y: 0 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 0 },
}

export const scalePopVariants: Variants = {
  initial: { opacity: 0, scale: 0.9, y: 0 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.8, y: 8 },
}

export const reducedScalePopVariants: Variants = {
  initial: { opacity: 0, scale: 1, y: 0 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 1, y: 0 },
}

export const sheetOverlayVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
}

export const sheetVariants: Variants = {
  initial: { y: '100%' },
  animate: { y: 0 },
  exit: { y: '100%' },
}

export const reducedSheetVariants: Variants = {
  initial: { y: 0 },
  animate: { y: 0 },
  exit: { y: 0 },
}

export const listStaggerVariants: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.05 } },
  exit: {},
}

export const imageLoadVariants: Variants = {
  initial: { opacity: 0, scale: 1.04 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 1.04 },
}

export const reducedImageLoadVariants: Variants = {
  initial: { opacity: 0, scale: 1 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 1 },
}

export function useMotionVariants() {
  const prefersReducedMotion = useReducedMotion()

  return useMemo(() => {
    const reduced = Boolean(prefersReducedMotion)

    return {
      prefersReducedMotion: reduced,
      fadeUp: reduced ? reducedFadeUpVariants : fadeUpVariants,
      scalePop: reduced ? reducedScalePopVariants : scalePopVariants,
      sheet: reduced ? reducedSheetVariants : sheetVariants,
      sheetOverlay: sheetOverlayVariants,
      listStagger: reduced ? { initial: {}, animate: {}, exit: {} } satisfies Variants : listStaggerVariants,
      imageLoad: reduced ? reducedImageLoadVariants : imageLoadVariants,
      transitions: {
        fade: reducedMotionSafeTransition(reduced, fadeTransition),
        spring: reducedMotionSafeTransition(reduced, springTransition),
        softSpring: reducedMotionSafeTransition(reduced, softSpringTransition),
        sheet: reducedMotionSafeTransition(reduced, sheetTransition),
        imageLoad: reducedMotionSafeTransition(reduced, imageLoadTransition),
      },
    }
  }, [prefersReducedMotion])
}
