import SwiftUI

struct EmptyChat: View {
    @EnvironmentObject var store: AppStore
    let send: (String) -> Void
    @State private var appear = false

    private let prompts = [
        ("Plan a trip", "Plan a 5-day trip to Tokyo on a budget"),
        ("Explain", "Explain quantum entanglement simply"),
        ("Write", "Write a short poem about the ocean at night"),
        ("Brainstorm", "Give me 10 startup ideas for 2026"),
    ]

    var body: some View {
        VStack(spacing: 18) {
            Spacer()
            Image(systemName: "sparkles")
                .font(.system(size: 40, weight: .bold))
                .foregroundStyle(Color.accentColor)
                .frame(width: 92, height: 92)
                .liquidGlass(cornerRadius: 28)
                .scaleEffect(appear ? 1 : 0.8)
                .opacity(appear ? 1 : 0)

            Text("What should we make?")
                .font(.system(size: 28, weight: .bold, design: .rounded))
                .multilineTextAlignment(.center)
                .opacity(appear ? 1 : 0)

            VStack(spacing: 10) {
                ForEach(Array(prompts.enumerated()), id: \.offset) { i, p in
                    Button { send(p.1) } label: {
                        HStack {
                            Text(p.1).font(.system(size: 15, weight: .medium))
                                .multilineTextAlignment(.leading)
                            Spacer()
                            Image(systemName: "arrow.up.right").font(.system(size: 13, weight: .bold)).opacity(0.5)
                        }
                        .padding(.horizontal, 16).padding(.vertical, 14)
                        .frame(maxWidth: .infinity)
                        .liquidGlass(cornerRadius: 20, interactive: true)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(.primary)
                    .opacity(appear ? 1 : 0)
                    .offset(y: appear ? 0 : 14)
                    .animation(.spring(response: 0.5, dampingFraction: 0.8).delay(Double(i) * 0.06), value: appear)
                }
            }
            .padding(.horizontal, 18)
            Spacer()
        }
        .onAppear { withAnimation(.spring(response: 0.6, dampingFraction: 0.7)) { appear = true } }
    }
}
