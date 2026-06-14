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

/// Clean, ChatGPT-style backdrop with a slow, living "aurora" — two soft blobs
/// drift behind the base gradient so the whole app feels alive without distracting.
struct GlassBackground: View {
    @Environment(\.colorScheme) private var scheme
    @State private var drift = false

    private var base: LinearGradient {
        scheme == .dark
            ? LinearGradient(colors: [Color(hex: 0x0B0B0C), Color(hex: 0x161618)], startPoint: .top, endPoint: .bottom)
            : LinearGradient(colors: [Color(hex: 0xFFFFFF), Color(hex: 0xF3F4F6)], startPoint: .top, endPoint: .bottom)
    }

    var body: some View {
        base
            .overlay(
                GeometryReader { geo in
                    let w = geo.size.width, h = geo.size.height
                    ZStack {
                        AuroraBlob(color: Color.accentColor.opacity(scheme == .dark ? 0.22 : 0.14))
                            .frame(width: w * 0.9, height: w * 0.9)
                            .offset(x: drift ? -w * 0.22 : w * 0.18,
                                    y: drift ? h * 0.06 : -h * 0.04)
                        AuroraBlob(color: (scheme == .dark ? Color.indigo : Color.cyan).opacity(scheme == .dark ? 0.18 : 0.12))
                            .frame(width: w * 0.8, height: w * 0.8)
                            .offset(x: drift ? w * 0.24 : -w * 0.16,
                                    y: drift ? h * 0.42 : h * 0.6)
                    }
                    .blur(radius: 60)
                    .animation(.easeInOut(duration: 14).repeatForever(autoreverses: true), value: drift)
                }
                .allowsHitTesting(false)
            )
            .ignoresSafeArea()
            .onAppear { drift = true }
    }
}

private struct AuroraBlob: View {
    let color: Color
    var body: some View {
        Circle().fill(
            RadialGradient(colors: [color, color.opacity(0)], center: .center, startRadius: 0, endRadius: 240)
        )
    }
}

/// Springy press feedback for any button — gentle shrink + dim while held.
struct PressableButtonStyle: ButtonStyle {
    var scale: CGFloat = 0.94
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? scale : 1)
            .opacity(configuration.isPressed ? 0.85 : 1)
            .animation(.spring(response: 0.28, dampingFraction: 0.6), value: configuration.isPressed)
    }
}

extension View {
    /// A soft slide-up + fade entrance, optionally staggered by index.
    func entrance(_ shown: Bool, index: Int = 0) -> some View {
        self
            .opacity(shown ? 1 : 0)
            .offset(y: shown ? 0 : 14)
            .animation(.spring(response: 0.55, dampingFraction: 0.82)
                .delay(Double(index) * 0.045), value: shown)
    }
}

/// A moving sheen used for loading placeholders.
struct ShimmerModifier: ViewModifier {
    @State private var move = false
    func body(content: Content) -> some View {
        content.overlay(
            GeometryReader { geo in
                let w = geo.size.width
                LinearGradient(colors: [.clear, Color.white.opacity(0.35), .clear],
                               startPoint: .leading, endPoint: .trailing)
                    .frame(width: w * 0.6)
                    .offset(x: move ? w : -w)
                    .animation(.linear(duration: 1.3).repeatForever(autoreverses: false), value: move)
            }
            .mask(content)
            .allowsHitTesting(false)
        )
        .onAppear { move = true }
    }
}

extension View {
    func shimmer() -> some View { modifier(ShimmerModifier()) }
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
