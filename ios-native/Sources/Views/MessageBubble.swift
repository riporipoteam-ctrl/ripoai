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
                    Label("AskAI", systemImage: "sparkles")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(Color.accentColor)
                }
                Group {
                    if message.text.isEmpty && streaming {
                        TypingDots()
                    } else {
                        Text(LocalizedStringKey(message.text))
                            .font(.system(size: 16))
                            .textSelection(.enabled)
                    }
                }
                .padding(.horizontal, 15).padding(.vertical, 11)
                .foregroundStyle(message.role == .user ? Color.white : Color.primary)
                .background(bubbleBackground)

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
            LinearGradient(colors: [Color.accentColor, Color(hex: 0xBE8CFF)],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
                .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(.white.opacity(0.3)))
        } else {
            RoundedRectangle(cornerRadius: 22, style: .continuous).fill(.clear)
                .liquidGlass(cornerRadius: 22)
        }
    }
}

struct TypingDots: View {
    @State private var phase = 0.0
    var body: some View {
        HStack(spacing: 5) {
            ForEach(0..<3) { i in
                Circle().frame(width: 7, height: 7)
                    .foregroundStyle(Color.accentColor)
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
