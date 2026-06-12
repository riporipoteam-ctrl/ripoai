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
    @State private var showCamera = false
    @State private var showModeSheet = false

    private var placeholder: String {
        if store.imageMode { return "Describe an image…" }
        if store.agentMode { return "Give OpenClaw a task…" }
        if store.webSearch { return "Search the web…" }
        return "Message AskAI…"
    }

    private var canSend: Bool { !draft.trimmingCharacters(in: .whitespaces).isEmpty || !store.pendingAttachments.isEmpty }

    var body: some View {
        VStack(spacing: 7) {
            if let err = store.errorText {
                Text(err).font(.caption).foregroundStyle(.red).padding(.horizontal, 18)
            }

            // Mode chips
            if store.webSearch || store.imageMode || store.agentMode {
                HStack(spacing: 6) {
                    if store.webSearch { ModeChip(label: "Web search", icon: "globe") { store.webSearch = false } }
                    if store.imageMode { ModeChip(label: "Create image", icon: "paintbrush") { store.imageMode = false } }
                    if store.agentMode { ModeChip(label: "OpenClaw", icon: "pawprint.fill") { store.agentMode = false } }
                    Spacer()
                }
                .padding(.horizontal, 18)
            }

            // Attachment thumbnails
            if !store.pendingAttachments.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(Array(store.pendingAttachments.enumerated()), id: \.offset) { i, dataURL in
                            ZStack(alignment: .topTrailing) {
                                AttachedThumb(dataURL: dataURL)
                                Button { store.pendingAttachments.remove(at: i) } label: {
                                    Image(systemName: "xmark.circle.fill")
                                        .font(.system(size: 17)).foregroundStyle(.white, .black.opacity(0.6))
                                }.offset(x: 5, y: -5)
                            }
                        }
                    }.padding(.horizontal, 18).padding(.top, 4)
                }
            }

            HStack(alignment: .bottom, spacing: 8) {
                // + categorized tools sheet
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    showModeSheet = true
                } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 19, weight: .semibold))
                        .foregroundStyle(.primary)
                        .frame(width: 38, height: 38)
                }
                .buttonStyle(.plain)
                .padding(.leading, 6).padding(.bottom, 5)

                TextField(placeholder, text: $draft, axis: .vertical)
                    .focused(focused)
                    .font(.system(size: 16.5))
                    .lineLimit(1...7)
                    .padding(.vertical, 12)
                    .onChange(of: speech.transcript) { _, t in if speech.isRecording { draft = t } }

                // Mic (hidden once typing)
                if !canSend {
                    Button {
                        speech.toggle(); UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    } label: {
                        Image(systemName: speech.isRecording ? "mic.fill" : "mic")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(speech.isRecording ? .red : .secondary)
                            .frame(width: 34, height: 34)
                            .symbolEffect(.pulse, isActive: speech.isRecording)
                    }
                    .buttonStyle(.plain).padding(.bottom, 7)
                }

                // Send / Stop — big, high-contrast, always visible
                Button {
                    if store.isStreaming { store.stop() }
                    else { if speech.isRecording { speech.stop() }; send(draft) }
                } label: {
                    Image(systemName: store.isStreaming ? "stop.fill" : "arrow.up")
                        .font(.system(size: 18, weight: .heavy))
                        .foregroundStyle(Color(uiColor: .systemBackground))
                        .frame(width: 44, height: 44)
                        .background(
                            Circle().fill(canSend || store.isStreaming ? Color.accentColor : Color.secondary.opacity(0.45))
                        )
                        .shadow(color: .black.opacity(0.2), radius: 6, y: 3)
                }
                .buttonStyle(.plain)
                .disabled(!canSend && !store.isStreaming)
                .padding(.trailing, 5).padding(.bottom, 4)
                .animation(.spring(response: 0.3), value: canSend)
            }
            .liquidGlass(cornerRadius: 26, interactive: true)
            .padding(.horizontal, 12)
            .padding(.bottom, 6)
        }
        .sheet(isPresented: $showModeSheet) {
            ModePickerSheet(
                onCamera: { showCamera = true },
                onPhotos: { showPhotoPicker = true },
                onLiveCamera: { store.requestLiveCamera = true },
                onScreenVision: { store.requestScreenVision = true },
                onVoiceCall: { store.requestVoiceCall = true }
            )
            .environmentObject(store)
        }
        .photosPicker(isPresented: $showPhotoPicker, selection: $photoItems, maxSelectionCount: 5, matching: .images)
        .fullScreenCover(isPresented: $showCamera) {
            CameraPicker { dataURL in store.pendingAttachments.append(dataURL) }
                .ignoresSafeArea()
        }
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
        .buttonStyle(.plain).foregroundStyle(.primary)
    }
}

private struct AttachedThumb: View {
    let dataURL: String
    var body: some View {
        Group {
            if let img = UIImage.fromDataURL(dataURL) {
                Image(uiImage: img).resizable().scaledToFill()
            } else { Color.secondary.opacity(0.2) }
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
