import SwiftUI

struct MessageBubble: View {
    @EnvironmentObject var store: AppStore
    let message: Message
    var streaming: Bool = false
    var isLast: Bool = false
    @State private var copied = false

    var body: some View {
        HStack {
            if message.role == .user { Spacer(minLength: 40) }
            VStack(alignment: message.role == .user ? .trailing : .leading, spacing: 4) {
                if message.role == .assistant {
                    Text("AskAI").font(.system(size: 12, weight: .bold)).foregroundStyle(.secondary)
                }

                // Attached photos (vision input)
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

                if let img = message.imageURL {
                    GeneratedImage(source: img)
                } else if !(message.text.isEmpty && message.attachments.isEmpty) || streaming {
                    Group {
                        if message.text.isEmpty && streaming {
                            TypingDots()
                        } else if !message.text.isEmpty {
                            if message.role == .assistant {
                                MarkdownText(text: message.text)
                                    .textSelection(.enabled)
                            } else {
                                Text(message.text)
                                    .font(.system(size: 16))
                                    .textSelection(.enabled)
                            }
                        }
                    }
                    .padding(.horizontal, 15).padding(.vertical, 11)
                    .foregroundStyle(message.role == .user ? Color(uiColor: .systemBackground) : Color.primary)
                    .background(bubbleBackground)
                    .contextMenu {
                        Button {
                            UIPasteboard.general.string = message.text
                        } label: { Label("Copy", systemImage: "doc.on.doc") }
                        ShareLink(item: message.text) { Label("Share", systemImage: "square.and.arrow.up") }
                    }
                }

                if message.role == .assistant && !streaming && !message.text.isEmpty {
                    HStack(spacing: 14) {
                        Button {
                            UIPasteboard.general.string = message.text
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                            copied = true
                            DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) { copied = false }
                        } label: {
                            Label(copied ? "Copied" : "Copy", systemImage: copied ? "checkmark" : "doc.on.doc")
                        }
                        if isLast {
                            Button {
                                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                                store.regenerate()
                            } label: { Label("Regenerate", systemImage: "arrow.clockwise") }
                        }
                    }
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.secondary)
                    .buttonStyle(.plain)
                    .padding(.top, 2)
                }
            }
            if message.role == .assistant { Spacer(minLength: 40) }
        }
    }

    @ViewBuilder private var bubbleBackground: some View {
        if message.role == .user {
            // Black bubble in light / white bubble in dark — like the web design.
            RoundedRectangle(cornerRadius: 22, style: .continuous).fill(Color.primary)
        } else {
            RoundedRectangle(cornerRadius: 22, style: .continuous).fill(.clear)
                .liquidGlass(cornerRadius: 22)
        }
    }
}

/// Generated image card: handles the "pending" placeholder, data URLs and remote URLs.
struct GeneratedImage: View {
    let source: String

    var body: some View {
        Group {
            if source == "pending" {
                VStack(spacing: 8) {
                    ProgressView()
                    Text("Creating your image…").font(.caption).foregroundStyle(.secondary)
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
                            Text("Couldn’t load image").font(.caption)
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
            }
        }
        .onAppear {
            Timer.scheduledTimer(withTimeInterval: 0.3, repeats: true) { _ in
                phase = (phase + 1).truncatingRemainder(dividingBy: 3)
            }
        }
    }
}
