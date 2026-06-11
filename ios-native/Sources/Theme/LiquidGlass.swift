import SwiftUI

/// Real Apple Liquid Glass when running on iOS 26+, with a faithful
/// ultra-thin-material fallback on older systems so the app still builds & runs.
struct LiquidGlassModifier: ViewModifier {
    var cornerRadius: CGFloat
    var tint: Color?
    var interactive: Bool

    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content.glassEffect(resolvedGlass, in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        } else {
            content
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .strokeBorder(.white.opacity(0.28), lineWidth: 1)
                )
                .shadow(color: .black.opacity(0.18), radius: 18, x: 0, y: 12)
        }
    }

    @available(iOS 26.0, *)
    private var resolvedGlass: Glass {
        var g: Glass = .regular
        if let tint { g = g.tint(tint) }
        if interactive { g = g.interactive() }
        return g
    }
}

extension View {
    /// Apply Liquid Glass to any view.
    func liquidGlass(cornerRadius: CGFloat = 24, tint: Color? = nil, interactive: Bool = false) -> some View {
        modifier(LiquidGlassModifier(cornerRadius: cornerRadius, tint: tint, interactive: interactive))
    }
}

/// Animated luminous background so the glass has light to refract.
struct GlassBackground: View {
    @State private var drift = false
    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color(hex: 0xEAF0FF), Color(hex: 0xF2EBFF), Color(hex: 0xE7FAF6)],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
            RadialGradient(colors: [Color.accentColor.opacity(0.30), .clear],
                           center: drift ? .topLeading : .topTrailing, startRadius: 10, endRadius: 520)
            RadialGradient(colors: [Color(hex: 0xBE8CFF).opacity(0.28), .clear],
                           center: drift ? .bottomTrailing : .center, startRadius: 10, endRadius: 560)
        }
        .ignoresSafeArea()
        .onAppear {
            withAnimation(.easeInOut(duration: 14).repeatForever(autoreverses: true)) { drift.toggle() }
        }
        .preferredColorScheme(nil)
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
