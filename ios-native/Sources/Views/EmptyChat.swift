import SwiftUI

struct EmptyChat: View {
    @EnvironmentObject var store: AppStore
    let send: (String) -> Void
    @State private var appear = false

    private let prompts = [
        "Plan a 5-day trip to Tokyo on a budget",
        "Explain quantum entanglement simply",
        "Generate an image of a sunset over mountains",
        "Give me 10 startup ideas for 2026",
    ]

    private var greeting: String {
        let h = Calendar.current.component(.hour, from: Date())
        if h < 5 { return "Up late?" }
        if h < 12 { return "Good morning." }
        if h < 18 { return "Good afternoon." }
        return "Good evening."
    }

    var body: some View {
        VStack(spacing: 18) {
            Spacer()
            Image(systemName: "circle.hexagongrid.fill")
                .font(.system(size: 36, weight: .bold))
                .foregroundStyle(.primary)
                .frame(width: 88, height: 88)
                .liquidGlass(cornerRadius: 28)
                .scaleEffect(appear ? 1 : 0.8)
                .opacity(appear ? 1 : 0)

            VStack(spacing: 2) {
                Text(greeting)
                    .font(.system(size: 26, weight: .bold, design: .rounded))
                Text("What are we making?")
                    .font(.system(size: 26, weight: .bold, design: .rounded))
                    .foregroundStyle(.secondary)
            }
            .multilineTextAlignment(.center)
            .opacity(appear ? 1 : 0)

            VStack(spacing: 10) {
                ForEach(Array(prompts.enumerated()), id: \.offset) { i, p in
                    Button { send(p) } label: {
                        HStack {
                            Text(p).font(.system(size: 15, weight: .medium))
                                .multilineTextAlignment(.leading)
                            Spacer()
                            Image(systemName: "arrow.up.right").font(.system(size: 13, weight: .bold)).opacity(0.4)
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
