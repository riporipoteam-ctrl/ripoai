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
                                    .transition(.move(edge: .bottom).combined(with: .opacity))
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.top, 8)
                        .padding(.bottom, 16)
                    }
                    .scrollDismissesKeyboard(.interactively)
                    .onChange(of: messages.last?.text) { _, _ in
                        if let last = messages.last?.id {
                            withAnimation(.easeOut(duration: 0.2)) { proxy.scrollTo(last, anchor: .bottom) }
                        }
                    }
                }
            }

            Composer(draft: $draft, focused: $composerFocused, send: send)
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

private struct TopBar: View {
    @EnvironmentObject var store: AppStore
    @Binding var showMenu: Bool

    var body: some View {
        HStack {
            GlassIconButton(system: "line.3.horizontal") { showMenu = true }
            Spacer()
            Menu {
                ForEach(AIModel.all) { m in
                    Button { store.model = m } label: {
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
