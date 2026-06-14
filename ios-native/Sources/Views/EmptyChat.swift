import SwiftUI

struct EmptyChat: View {
    @EnvironmentObject var store: AppStore
    let send: (String) -> Void
    @State private var appear = false
    @State private var breathe = false

    private var greeting: String {
        let h = Calendar.current.component(.hour, from: Date())
        if h < 5 { return "Up late?" }
        if h < 12 { return "Good morning." }
        if h < 18 { return "Good afternoon." }
        return "Good evening."
    }

    var body: some View {
        VStack(spacing: 13) {
            Spacer(minLength: 8)
            Image(systemName: "circle.hexagongrid.fill")
                .font(.system(size: 28, weight: .bold))
                .foregroundStyle(.primary)
                .frame(width: 66, height: 66)
                .liquidGlass(cornerRadius: 22)
                .rotationEffect(.degrees(breathe ? 8 : -8))
                .scaleEffect(appear ? (breathe ? 1.04 : 0.98) : 0.8)
                .shadow(color: Color.accentColor.opacity(breathe ? 0.35 : 0.12), radius: breathe ? 18 : 8)
                .opacity(appear ? 1 : 0)
                .animation(.easeInOut(duration: 2.6).repeatForever(autoreverses: true), value: breathe)

            VStack(spacing: 2) {
                Text(store.t(greeting))
                    .font(.system(size: 22, weight: .bold, design: .rounded))
                Text(store.t("What are we making?"))
                    .font(.system(size: 22, weight: .bold, design: .rounded))
                    .foregroundStyle(.secondary)
            }
            .multilineTextAlignment(.center)
            .entrance(appear, index: 1)

            // Quick actions — surface the new tools right from the home screen.
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    quickChip("pawprint.fill", "Agent", .orange, 2) {
                        store.agentMode = true; store.webSearch = false; store.imageMode = false
                    }
                    quickChip("paintbrush.fill", "Image", .pink, 3) {
                        store.imageMode = true; store.agentMode = false; store.webSearch = false
                    }
                    quickChip("globe", "Web", .cyan, 4) {
                        store.webSearch = true; store.agentMode = false; store.imageMode = false
                    }
                    quickChip("eye.fill", "Live camera", .purple, 5) { store.requestLiveCamera = true }
                    quickChip("waveform", "Voice", .indigo, 6) { store.requestVoiceCall = true }
                }
                .padding(.horizontal, 18)
            }

            Spacer()
        }
        .onAppear {
            withAnimation(.spring(response: 0.6, dampingFraction: 0.7)) { appear = true }
            breathe = true
        }
    }

    private func quickChip(_ icon: String, _ label: String, _ tint: Color, _ index: Int, _ action: @escaping () -> Void) -> some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            action()
        } label: {
            HStack(spacing: 6) {
                Image(systemName: icon).font(.system(size: 12, weight: .bold)).foregroundStyle(tint)
                Text(store.t(label)).font(.system(size: 13, weight: .semibold)).foregroundStyle(.primary)
            }
            .padding(.horizontal, 13).padding(.vertical, 9)
            .liquidGlass(cornerRadius: 16, interactive: true)
        }
        .buttonStyle(PressableButtonStyle())
        .entrance(appear, index: index)
    }
}
