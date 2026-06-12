import SwiftUI
import PhotosUI

struct Composer: View {
    @EnvironmentObject var store: AppStore
    @Binding var draft: String
    var focused: FocusState<Bool>.Binding
    let send: (String) -> Void

    @StateObject private var speech = SpeechInput()
    @State private var photoItems: [PhotosPickerItem] = []
    @State private var showPhotoPicker = false

    private var placeholder: String {
        if store.imageMode { return "Describe an image…" }
        if store.agentMode { return "Give the agent a task…" }
        if store.webSearch { return "Search the web…" }
        return "Message AskAI…"
    }

    var body: some View {
        VStack(spacing: 6) {
            if let err = store.errorText {
                Text(err).font(.caption).foregroundStyle(.secondary).padding(.horizontal, 18)
            }

            // Active mode chips
            if store.webSearch || store.imageMode || store.agentMode {
                HStack(spacing: 6) {
                    if store.webSearch { ModeChip(label: "Web search", icon: "globe") { store.webSearch = false } }
                    if store.imageMode { ModeChip(label: "Create image", icon: "photo") { store.imageMode = false } }
                    if store.agentMode { ModeChip(label: "Agent", icon: "sparkles") { store.agentMode = false } }
                    Spacer()
                }
                .padding(.horizontal, 18)
            }

            // Attached images strip
            if !store.pendingAttachments.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(Array(store.pendingAttachments.enumerated()), id: \.offset) { i, dataURL in
                            ZStack(alignment: .topTrailing) {
                                AttachedThumb(dataURL: dataURL)
                                Button {
                                    store.pendingAttachments.remove(at: i)
                                } label: {
                                    Image(systemName: "xmark.circle.fill")
                                        .font(.system(size: 16))
                                        .foregroundStyle(.white, .black.opacity(0.6))
                                }
                                .offset(x: 5, y: -5)
                            }
                        }
                    }
                    .padding(.horizontal, 18).padding(.top, 4)
                }
            }

            HStack(alignment: .bottom, spacing: 6) {
                // + menu: attach photos & modes
                Menu {
                    Button { showPhotoPicker = true } label: { Label("Attach photos", systemImage: "photo.on.rectangle") }
                    Divider()
                    Button { store.imageMode.toggle(); store.webSearch = false; store.agentMode = false } label: {
                        Label(store.imageMode ? "Create image ✓" : "Create image", systemImage: "paintbrush")
                    }
                    Button { store.webSearch.toggle(); store.imageMode = false; store.agentMode = false } label: {
                        Label(store.webSearch ? "Web search ✓" : "Web search", systemImage: "globe")
                    }
                    Button { store.agentMode.toggle(); store.imageMode = false; store.webSearch = false } label: {
                        Label(store.agentMode ? "Agent mode ✓" : "Agent mode", systemImage: "sparkles")
                    }
                } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 18, weight: .semibold))
                        .frame(width: 36, height: 36)
                }
                .foregroundStyle(.primary)
                .padding(.leading, 8).padding(.bottom, 7)

                TextField(placeholder, text: $draft, axis: .vertical)
                    .focused(focused)
                    .font(.system(size: 16))
                    .lineLimit(1...6)
                    .padding(.vertical, 13)
                    .onChange(of: speech.transcript) { _, t in
                        if speech.isRecording { draft = t }
                    }

                // Mic
                Button {
                    speech.toggle()
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                } label: {
                    Image(systemName: speech.isRecording ? "mic.fill" : "mic")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(speech.isRecording ? Color.red : Color.secondary)
                        .frame(width: 32, height: 34)
                        .symbolEffect(.pulse, isActive: speech.isRecording)
                }
                .buttonStyle(.plain)
                .padding(.bottom, 8)

                // Send / stop
                Button {
                    if store.isStreaming { store.stop() } else {
                        if speech.isRecording { speech.stop() }
                        send(draft)
                    }
                } label: {
                    Image(systemName: store.isStreaming ? "stop.fill" : "arrow.up")
                        .font(.system(size: 17, weight: .bold))
                        .foregroundStyle(Color(uiColor: .systemBackground))
                        .frame(width: 40, height: 40)
                        .background(
                            Circle().fill(
                                (draft.isEmpty && store.pendingAttachments.isEmpty && !store.isStreaming)
                                ? AnyShapeStyle(Color.secondary.opacity(0.4))
                                : AnyShapeStyle(Color.primary)
                            )
                        )
                }
                .buttonStyle(.plain)
                .disabled(draft.isEmpty && store.pendingAttachments.isEmpty && !store.isStreaming)
                .padding(.trailing, 6).padding(.bottom, 6)
            }
            .liquidGlass(cornerRadius: 28, interactive: true)
            .shadow(color: Color.primary.opacity(focused.wrappedValue ? 0.18 : 0.0), radius: 16, y: 6)
            .animation(.easeOut(duration: 0.25), value: focused.wrappedValue)
            .padding(.horizontal, 12)
            .padding(.bottom, 8)
        }
        .photosPicker(isPresented: $showPhotoPicker, selection: $photoItems, maxSelectionCount: 5, matching: .images)
        .onChange(of: photoItems) { _, items in
            guard !items.isEmpty else { return }
            Task {
                for item in items {
                    if let data = try? await item.loadTransferable(type: Data.self),
                       let img = UIImage(data: data),
                       let jpeg = img.resized(maxSide: 1280).jpegData(compressionQuality: 0.7) {
                        store.pendingAttachments.append("data:image/jpeg;base64,\(jpeg.base64EncodedString())")
                    }
                }
                photoItems = []
            }
        }
    }
}

private struct ModeChip: View {
    let label: String
    let icon: String
    let clear: () -> Void
    var body: some View {
        Button(action: clear) {
            HStack(spacing: 5) {
                Image(systemName: icon).font(.system(size: 11, weight: .bold))
                Text(label).font(.system(size: 12, weight: .semibold))
                Image(systemName: "xmark").font(.system(size: 9, weight: .bold)).foregroundStyle(.secondary)
            }
            .padding(.horizontal, 10).padding(.vertical, 6)
            .liquidGlass(cornerRadius: 14)
        }
        .buttonStyle(.plain)
        .foregroundStyle(.primary)
    }
}

private struct AttachedThumb: View {
    let dataURL: String
    var body: some View {
        Group {
            if let img = UIImage.fromDataURL(dataURL) {
                Image(uiImage: img).resizable().scaledToFill()
            } else {
                Color.secondary.opacity(0.2)
            }
        }
        .frame(width: 56, height: 56)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

extension UIImage {
    static func fromDataURL(_ s: String) -> UIImage? {
        guard let comma = s.firstIndex(of: ","),
              let data = Data(base64Encoded: String(s[s.index(after: comma)...])) else { return nil }
        return UIImage(data: data)
    }
    func resized(maxSide: CGFloat) -> UIImage {
        let scale = min(1, maxSide / max(size.width, size.height))
        guard scale < 1 else { return self }
        let newSize = CGSize(width: size.width * scale, height: size.height * scale)
        let renderer = UIGraphicsImageRenderer(size: newSize)
        return renderer.image { _ in draw(in: CGRect(origin: .zero, size: newSize)) }
    }
}
