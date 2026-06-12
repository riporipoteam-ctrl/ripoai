import SwiftUI

/// A categorized tool/mode picker (like ChatGPT/Gemini), grouped into
/// Attach · Modes · Talk. Replaces the flat "+" menu with clear categories.
struct ModePickerSheet: View {
    @EnvironmentObject var store: AppStore
    @Environment(\.dismiss) private var dismiss

    let onCamera: () -> Void
    let onPhotos: () -> Void
    let onLiveCamera: () -> Void
    let onScreenVision: () -> Void
    let onVoiceCall: () -> Void

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    category("Attach") {
                        row("camera.fill", "Take photo", "Snap a picture to attach", tint: .blue) {
                            dismiss(); onCamera()
                        }
                        row("photo.on.rectangle.angled", "Photo library", "Add images from your library", tint: .green) {
                            dismiss(); onPhotos()
                        }
                        row("eye.fill", "Live camera", "Let AskAI see through your camera", tint: .purple) {
                            dismiss(); onLiveCamera()
                        }
                        row("rectangle.inset.filled.on.rectangle", "Share screen", "Let AskAI see your screen across apps", tint: .teal) {
                            dismiss(); onScreenVision()
                        }
                    }

                    category("Modes") {
                        modeRow("bubble.left.and.bubble.right.fill", "Chat", "Standard conversation", tint: .gray,
                                on: !store.webSearch && !store.imageMode && !store.agentMode) {
                            store.webSearch = false; store.imageMode = false; store.agentMode = false; dismiss()
                        }
                        modeRow("globe", "Web search", "Answer with live results from the web", tint: .cyan,
                                on: store.webSearch) {
                            store.webSearch = true; store.imageMode = false; store.agentMode = false; dismiss()
                        }
                        modeRow("paintbrush.fill", "Create image", "Generate an image from a prompt", tint: .pink,
                                on: store.imageMode) {
                            store.imageMode = true; store.webSearch = false; store.agentMode = false; dismiss()
                        }
                        modeRow("sparkles", "Agent", "Multi-step work with live web access", tint: .orange,
                                on: store.agentMode) {
                            store.agentMode = true; store.webSearch = false; store.imageMode = false; dismiss()
                        }
                    }

                    category("Talk") {
                        row("waveform", "Voice call", "Talk to AskAI hands-free", tint: .indigo) {
                            dismiss(); onVoiceCall()
                        }
                    }
                }
                .padding(18)
            }
            .navigationTitle("Tools")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { dismiss() } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary) }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    @ViewBuilder private func category(_ title: String, @ViewBuilder _ content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title.uppercased())
                .font(.system(size: 12, weight: .bold)).foregroundStyle(.secondary)
                .tracking(0.5)
            VStack(spacing: 8) { content() }
        }
    }

    private func row(_ icon: String, _ title: String, _ sub: String, tint: Color,
                     action: @escaping () -> Void) -> some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            action()
        } label: {
            HStack(spacing: 13) {
                ZStack {
                    RoundedRectangle(cornerRadius: 11, style: .continuous).fill(tint.opacity(0.18))
                        .frame(width: 40, height: 40)
                    Image(systemName: icon).font(.system(size: 17, weight: .semibold)).foregroundStyle(tint)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.system(size: 16, weight: .semibold)).foregroundStyle(.primary)
                    Text(sub).font(.system(size: 12.5)).foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "chevron.right").font(.system(size: 13, weight: .bold)).foregroundStyle(.tertiary)
            }
            .padding(.horizontal, 12).padding(.vertical, 9)
            .liquidGlass(cornerRadius: 16)
        }
        .buttonStyle(.plain)
    }

    private func modeRow(_ icon: String, _ title: String, _ sub: String, tint: Color, on: Bool,
                         action: @escaping () -> Void) -> some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            action()
        } label: {
            HStack(spacing: 13) {
                ZStack {
                    RoundedRectangle(cornerRadius: 11, style: .continuous).fill(tint.opacity(0.18))
                        .frame(width: 40, height: 40)
                    Image(systemName: icon).font(.system(size: 17, weight: .semibold)).foregroundStyle(tint)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.system(size: 16, weight: .semibold)).foregroundStyle(.primary)
                    Text(sub).font(.system(size: 12.5)).foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: on ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 19)).foregroundStyle(on ? tint : Color.secondary.opacity(0.4))
            }
            .padding(.horizontal, 12).padding(.vertical, 9)
            .liquidGlass(cornerRadius: 16)
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(on ? tint.opacity(0.5) : .clear, lineWidth: 1.5)
            )
        }
        .buttonStyle(.plain)
    }
}
