import SwiftUI

struct ChatScreen: View {
    @EnvironmentObject var store: AppStore
    @Binding var showMenu: Bool
    @State private var draft = ""
    @FocusState private var composerFocused: Bool

    private var messages: [Message] { store.current?.messages ?? [] }

    var body: some View {
        VStack(spacing: 0) {
            TopBar(showMenu: $showMenu)

            if messages.isEmpty {
                EmptyChat(send: send)
            } else {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 14) {
                            ForEach(messages) { msg in
                                MessageBubble(message: msg,
                                              streaming: store.isStreaming && msg.id == messages.last?.id && msg.role == .assistant,
                                              isLast: msg.id == messages.last?.id && msg.role == .assistant)
                                    .id(msg.id)
                                    .transition(.asymmetric(
                                        insertion: .move(edge: .bottom).combined(with: .opacity).combined(with: .scale(scale: 0.98, anchor: .bottom)),
                                        removal: .opacity))
                            }
                            if store.isStreaming, store.phase != .writing {
                                StatusIndicator(phase: store.phase).id("status")
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .padding(.leading, 4)
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.top, 8)
                        .padding(.bottom, 8)
                    }
                    .scrollDismissesKeyboard(.interactively)
                    .onChange(of: messages.last?.text) { _, _ in scrollDown(proxy) }
                    .onChange(of: store.phase) { _, _ in scrollDown(proxy) }
                }
            }
        }
        // safeAreaInset keeps the composer ABOVE the keyboard, always.
        .safeAreaInset(edge: .bottom, spacing: 0) {
            Composer(draft: $draft, focused: $composerFocused, send: send)
        }
    }

    private func scrollDown(_ proxy: ScrollViewProxy) {
        withAnimation(.easeOut(duration: 0.2)) {
            if store.isStreaming, store.phase != .writing {
                proxy.scrollTo("status", anchor: .bottom)
            } else if let last = messages.last?.id {
                proxy.scrollTo(last, anchor: .bottom)
            }
        }
    }

    private func send(_ text: String) {
        let t = text.isEmpty ? draft : text
        store.send(t)
        draft = ""
        composerFocused = false
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    }
}

/// Animated "Thinking… / Searching the web… / Generating… " row.
struct StatusIndicator: View {
    let phase: StreamPhase
    @State private var dots = 0

    private var label: String {
        switch phase {
        case .searching: return "Searching the web"
        case .generating: return "Generating image"
        case .thinking: return "Thinking"
        default: return "Working"
        }
    }
    private var icon: String {
        switch phase {
        case .searching: return "globe"
        case .generating: return "photo"
        default: return "sparkles"
        }
    }

    var body: some View {
        HStack(spacing: 9) {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(.secondary)
                .symbolEffect(.pulse, options: .repeating)
            Text(label + String(repeating: ".", count: dots))
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 13).padding(.vertical, 10)
        .liquidGlass(cornerRadius: 16)
        .onAppear {
            Timer.scheduledTimer(withTimeInterval: 0.4, repeats: true) { _ in
                dots = (dots + 1) % 4
            }
        }
    }
}

private struct TopBar: View {
    @EnvironmentObject var store: AppStore
    @Binding var showMenu: Bool

    var body: some View {
        HStack {
            GlassIconButton(system: "line.3.horizontal") { showMenu = true }
            Spacer()
            Menu {
                ForEach(AIModel.selectable) { m in
                    Button { store.setModel(m) } label: {
                        if store.model.id == m.id {
                            Label(m.menuLabel, systemImage: "checkmark")
                        } else {
                            Text(m.menuLabel)
                        }
                    }
                }
            } label: {
                HStack(spacing: 6) {
                    Text(store.model.name).font(.system(size: 15, weight: .bold))
                    Image(systemName: "chevron.down").font(.system(size: 11, weight: .bold)).foregroundStyle(.secondary)
                }
                .padding(.horizontal, 14).padding(.vertical, 9)
                .liquidGlass(cornerRadius: 20)
            }
            .foregroundStyle(.primary)
            Spacer()
            GlassIconButton(system: "square.and.pencil") {
                store.newChat()
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
            }
        }
        .padding(.horizontal, 14)
        .padding(.top, 6)
        .padding(.bottom, 8)
    }
}

struct GlassIconButton: View {
    let system: String
    let action: () -> Void
    var body: some View {
        Button {
            action()
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        } label: {
            Image(systemName: system)
                .font(.system(size: 17, weight: .semibold))
                .frame(width: 42, height: 42)
                .liquidGlass(cornerRadius: 21)
        }
        .buttonStyle(.plain)
        .foregroundStyle(.primary)
    }
}
