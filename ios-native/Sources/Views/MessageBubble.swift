import SwiftUI

// ChatGPT-style message row: the assistant speaks full-width as plain text with
// a small gradient avatar; the user gets a soft light-gray rounded bubble. Each
// row fades + slides in. (Rewritten for the new clean look.)
struct MessageBubble: View {
    @EnvironmentObject var store: AppStore
    let message: Message
    var streaming: Bool = false
    var isLast: Bool = false
    @State private var copied = false
    @State private var appeared = false

    private var userBubble: Color { Color.primary.opacity(0.06) }

    var body: some View {
        Group {
            if message.role == .user { userRow } else { assistantRow }
        }
        .opacity(appeared ? 1 : 0)
        .offset(y: appeared ? 0 : 10)
        .onAppear { withAnimation(.spring(response: 0.5, dampingFraction: 0.85)) { appeared = true } }
    }

    // MARK: User
    private var userRow: some View {
        HStack(alignment: .bottom, spacing: 0) {
            Spacer(minLength: 48)
            VStack(alignment: .trailing, spacing: 6) {
                attachments
                if let img = message.imageURL {
                    GeneratedImage(source: img)
                } else if !message.text.isEmpty {
                    Text(message.text)
                        .font(.system(size: 16))
                        .foregroundStyle(.primary)
                        .padding(.horizontal, 15).padding(.vertical, 11)
                        .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(userBubble))
                        .textSelection(.enabled)
                        .contextMenu { copyShare }
                }
            }
        }
    }

    // MARK: Assistant
    private var assistantRow: some View {
        HStack(alignment: .top, spacing: 10) {
            AssistantAvatar()
            VStack(alignment: .leading, spacing: 6) {
                Text("AskAI").font(.system(size: 13, weight: .bold)).foregroundStyle(.primary)
                if let img = message.imageURL {
                    GeneratedImage(source: img)
                } else if message.text.isEmpty && streaming {
                    TypingDots().padding(.top, 2)
                } else if !message.text.isEmpty {
                    MarkdownText(text: message.text)
                        .textSelection(.enabled)
                        .contextMenu { copyShare }
                }
                if !streaming && !message.text.isEmpty { actions }
            }
            Spacer(minLength: 16)
        }
    }

    @ViewBuilder private var attachments: some View {
        if !message.attachments.isEmpty {
            HStack(spacing: 6) {
                ForEach(Array(message.attachments.prefix(4).enumerated()), id: \.offset) { _, dataURL in
                    if let img = UIImage.fromDataURL(dataURL) {
                        Image(uiImage: img).resizable().scaledToFill()
                            .frame(width: 84, height: 84)
                            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                }
            }
        }
    }

    @ViewBuilder private var copyShare: some View {
        Button { UIPasteboard.general.string = message.text } label: { Label(store.t("Copy"), systemImage: "doc.on.doc") }
        ShareLink(item: message.text) { Label(store.t("Share"), systemImage: "square.and.arrow.up") }
    }

    private var actions: some View {
        HStack(spacing: 16) {
            Button {
                UIPasteboard.general.string = message.text
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                copied = true
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) { copied = false }
            } label: {
                Label(copied ? store.t("Copied") : store.t("Copy"), systemImage: copied ? "checkmark" : "doc.on.doc")
            }
            if isLast {
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    store.regenerate()
                } label: { Label(store.t("Regenerate"), systemImage: "arrow.clockwise") }
            }
        }
        .font(.system(size: 12, weight: .semibold))
        .foregroundStyle(.secondary)
        .buttonStyle(.plain)
        .padding(.top, 2)
    }
}

/// Small gradient AskAI avatar shown beside every assistant message.
struct AssistantAvatar: View {
    var body: some View {
        Image(systemName: "sparkle")
            .font(.system(size: 14, weight: .bold))
            .foregroundStyle(.white)
            .frame(width: 30, height: 30)
            .background(
                LinearGradient(colors: [Color.accentColor, Color.accentColor.opacity(0.7)],
                               startPoint: .topLeading, endPoint: .bottomTrailing),
                in: Circle()
            )
            .shadow(color: Color.accentColor.opacity(0.35), radius: 5, y: 2)
    }
}

/// Generated image card: tap to open a zoomable full-screen viewer (save/share).
struct GeneratedImage: View {
    @EnvironmentObject var store: AppStore
    let source: String
    @State private var showViewer = false

    var body: some View {
        Group {
            if source == "pending" {
                ZStack {
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .fill(Color.primary.opacity(0.06))
                        .shimmer()
                    VStack(spacing: 8) {
                        ProgressView()
                        Text(store.t("Creating your image…")).font(.caption).foregroundStyle(.secondary)
                    }
                }
                .frame(maxWidth: .infinity, minHeight: 260)
            } else if source.hasPrefix("data:"), let img = UIImage.fromDataURL(source) {
                Image(uiImage: img).resizable().scaledToFit()
            } else if let url = URL(string: source) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image): image.resizable().scaledToFit()
                    case .failure:
                        VStack(spacing: 6) {
                            Image(systemName: "photo").font(.title2)
                            Text(store.t("Couldn’t load image")).font(.caption)
                        }.frame(maxWidth: .infinity, minHeight: 200).foregroundStyle(.secondary)
                    default:
                        ProgressView().frame(maxWidth: .infinity, minHeight: 240)
                    }
                }
            }
        }
        .frame(maxWidth: 300)
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .liquidGlass(cornerRadius: 22)
        .overlay(alignment: .bottomTrailing) {
            if source != "pending" {
                Image(systemName: "arrow.up.left.and.arrow.down.right")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(.white)
                    .padding(7)
                    .background(.black.opacity(0.45), in: Circle())
                    .padding(8)
            }
        }
        .onTapGesture { if source != "pending" { showViewer = true } }
        .fullScreenCover(isPresented: $showViewer) {
            ImageViewer(source: source)
        }
    }
}

struct TypingDots: View {
    @State private var phase = 0.0
    var body: some View {
        HStack(spacing: 5) {
            ForEach(0..<3) { i in
                Circle().frame(width: 7, height: 7)
                    .foregroundStyle(.secondary)
                    .opacity(phase == Double(i) ? 1 : 0.3)
                    .scaleEffect(phase == Double(i) ? 1.15 : 1)
            }
        }
        .animation(.easeInOut(duration: 0.25), value: phase)
        .onAppear {
            Timer.scheduledTimer(withTimeInterval: 0.3, repeats: true) { _ in
                phase = (phase + 1).truncatingRemainder(dividingBy: 3)
            }
        }
    }
}
