import SwiftUI

struct EmptyChat: View {
    @EnvironmentObject var store: AppStore
    let send: (String) -> Void
    @State private var appear = false

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
                .scaleEffect(appear ? 1 : 0.8)
                .opacity(appear ? 1 : 0)

            VStack(spacing: 2) {
                Text(store.t(greeting))
                    .font(.system(size: 22, weight: .bold, design: .rounded))
                Text(store.t("What are we making?"))
                    .font(.system(size: 22, weight: .bold, design: .rounded))
                    .foregroundStyle(.secondary)
            }
            .multilineTextAlignment(.center)
            .opacity(appear ? 1 : 0)

            // Quick actions — surface the new tools right from the home screen.
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    quickChip("pawprint.fill", "Agent", .orange) {
                        store.agentMode = true; store.webSearch = false; store.imageMode = false
                    }
                    quickChip("paintbrush.fill", "Image", .pink) {
                        store.imageMode = true; store.agentMode = false; store.webSearch = false
                    }
                    quickChip("globe", "Web", .cyan) {
                        store.webSearch = true; store.agentMode = false; store.imageMode = false
                    }
                    quickChip("eye.fill", "Live camera", .purple) { store.requestLiveCamera = true }
                    quickChip("waveform", "Voice", .indigo) { store.requestVoiceCall = true }
                }
                .padding(.horizontal, 18)
            }
            .opacity(appear ? 1 : 0)

            Spacer()
        }
        .onAppear { withAnimation(.spring(response: 0.6, dampingFraction: 0.7)) { appear = true } }
    }

    private func quickChip(_ icon: String, _ label: String, _ tint: Color, _ action: @escaping () -> Void) -> some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            action()
        } label: {
            HStack(spacing: 6) {
                Image(systemName: icon).font(.system(size: 12, weight: .bold)).foregroundStyle(tint)
                Text(label).font(.system(size: 13, weight: .semibold)).foregroundStyle(.primary)
            }
            .padding(.horizontal, 13).padding(.vertical, 9)
            .liquidGlass(cornerRadius: 16, interactive: true)
        }
        .buttonStyle(.plain)
    }
}
