import type { ReactNode } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import { BlurView } from 'expo-blur'
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect'

type Props = {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  interactive?: boolean
}

export function AdaptiveGlass({ children, style, interactive }: Props) {
  const baseStyle: StyleProp<ViewStyle> = [
    {
      borderRadius: 28,
      overflow: 'hidden',
    },
    style,
  ]

  if (isLiquidGlassAvailable()) {
    return (
      <GlassView isInteractive={interactive} style={baseStyle}>
        {children}
      </GlassView>
    )
  }

  return (
    <BlurView tint="systemMaterial" intensity={86} style={baseStyle}>
      {children}
    </BlurView>
  )
}
