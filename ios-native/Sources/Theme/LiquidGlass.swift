import SwiftUI

/// Real Apple Liquid Glass when running on iOS 26+, with an ultra-thin-material
/// fallback on older systems. Monochrome — no color tints.
struct LiquidGlassModifier: ViewModifier {
    var cornerRadius: CGFloat
    var interactive: Bool

    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content.glassEffect(interactive ? Glass.regular.interactive() : .regular,
                                in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        } else {
            content
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .strokeBorder(Color.primary.opacity(0.08), lineWidth: 1)
                )
                .shadow(color: .black.opacity(0.10), radius: 14, x: 0, y: 8)
        }
    }
}

extension View {
    func liquidGlass(cornerRadius: CGFloat = 24, interactive: Bool = false) -> some View {
        modifier(LiquidGlassModifier(cornerRadius: cornerRadius, interactive: interactive))
    }
}

/// Clean, ChatGPT-style backdrop: white→soft gray in light, true black in dark.
struct GlassBackground: View {
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        Group {
            if scheme == .dark {
                LinearGradient(colors: [Color(hex: 0x0B0B0C), Color(hex: 0x161618)],
                               startPoint: .top, endPoint: .bottom)
            } else {
                LinearGradient(colors: [Color(hex: 0xFFFFFF), Color(hex: 0xF3F4F6)],
                               startPoint: .top, endPoint: .bottom)
            }
        }
        .ignoresSafeArea()
    }
}

extension Color {
    init(hex: UInt, alpha: Double = 1) {
        self.init(.sRGB,
                  red: Double((hex >> 16) & 0xFF) / 255,
                  green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255,
                  opacity: alpha)
    }
}
