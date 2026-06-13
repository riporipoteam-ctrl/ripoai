import SwiftUI

struct ChatScreen: View {
    @EnvironmentObject var store: AppStore
    @Binding var showMenu: Bool
    @State private var draft = ""
    @FocusState private var composerFocused: Bool
    @StateObject private var keyboard = KeyboardObserver()

    private var messages: [Message] { store.current?.messages ?? [] }

    var body: some View {
        VStack(spacing: 0) {
            TopBar(showMenu: $showMenu)

            // In-app task pill (Dynamic-Island-style) — always visible during a task.
            if store.isStreaming {
                TaskPill()
                    .padding(.horizontal, 12)
                    .padding(.bottom, 4)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }

            if messages.isEmpty {
                // Scrollable so the top bar stays reachable on any screen size /
                // when the keyboard is up — centers when there's room, scrolls when not.
                GeometryReader { geo in
                    ScrollView {
                        EmptyChat(send: send)
                            .frame(minHeight: geo.size.height)
                    }
                    .scrollDismissesKeyboard(.interactively)
                }
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
                        }
                        .padding(.horizontal, 16)
                        .padding(.top, 8)
                        .padding(.bottom, 8)
                        .animation(.spring(response: 0.4, dampingFraction: 0.82), value: messages.count)
                    }
                    .scrollDismissesKeyboard(.interactively)
                    .onChange(of: messages.last?.text) { _, _ in scrollDown(proxy) }
                    .onChange(of: store.phase) { _, _ in scrollDown(proxy) }
                }
            }
        }
        // Composer is lifted manually by the real keyboard height (auto safe-area
        // avoidance is turned off below so the two never fight or cancel out).
        .safeAreaInset(edge: .bottom, spacing: 0) {
            Composer(draft: $draft, focused: $composerFocused, send: send)
                .padding(.bottom, keyboard.height)
        }
        .ignoresSafeArea(.keyboard, edges: .bottom)
        .animation(.spring(response: 0.4, dampingFraction: 0.85), value: store.isStreaming)
        // Swipe in from the left edge to open the sidebar (ChatGPT/Gemini style).
        .overlay(alignment: .leading) {
            Color.clear
                .frame(width: 20)
                .frame(maxHeight: .infinity)
                .contentShape(Rectangle())
                .gesture(
                    DragGesture(minimumDistance: 12)
                        .onEnded { v in
                            if v.translation.width > 45 && abs(v.translation.height) < 60 {
                                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                                showMenu = true
                            }
                        }
                )
        }
    }

    private func scrollDown(_ proxy: ScrollViewProxy) {
        withAnimation(.easeOut(duration: 0.2)) {
            if let last = messages.last?.id { proxy.scrollTo(last, anchor: .bottom) }
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

/// In-app "Dynamic Island" task pill — a live status banner pinned under the top
/// bar while a task runs (works regardless of OS Live Activity availability).
struct TaskPill: View {
    @EnvironmentObject var store: AppStore

    private var label: String {
        if let a = store.agent, a.running { return a.statusLine }
        switch store.phase {
        case .searching: return "Searching the web"
        case .generating: return "Creating image"
        case .writing: return "Writing the answer"
        case .thinking: return "Thinking"
        default: return "Working"
        }
    }
    private var icon: String {
        if store.agent?.running == true { return "pawprint.fill" }
        switch store.phase {
        case .searching: return "globe"
        case .generating: return "photo"
        default: return "sparkles"
        }
    }

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(.primary)
                .symbolEffect(.pulse, options: .repeating)
            Text(store.t(label))
                .font(.system(size: 13.5, weight: .semibold))
                .foregroundStyle(.primary)
                .lineLimit(1)
            Spacer(minLength: 6)
            ProgressView().scaleEffect(0.72)
            Button { store.stop() } label: {
                Image(systemName: "stop.fill").font(.system(size: 11, weight: .bold))
                    .foregroundStyle(.secondary).frame(width: 24, height: 24)
                    .background(Color.primary.opacity(0.08), in: Circle())
            }.buttonStyle(.plain)
        }
        .padding(.horizontal, 14).padding(.vertical, 8)
        .frame(maxWidth: .infinity)
        .background(.ultraThinMaterial, in: Capsule())
        .overlay(Capsule().strokeBorder(Color.primary.opacity(0.08), lineWidth: 1))
        .shadow(color: .black.opacity(0.12), radius: 10, y: 4)
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
