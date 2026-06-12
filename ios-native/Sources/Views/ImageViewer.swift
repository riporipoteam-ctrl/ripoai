import SwiftUI
import Photos

/// Full-screen zoomable image viewer with Save-to-Photos and Share.
struct ImageViewer: View {
    let source: String          // data: URL or remote URL
    @Environment(\.dismiss) private var dismiss
    @State private var scale: CGFloat = 1
    @State private var lastScale: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var lastOffset: CGSize = .zero
    @State private var uiImage: UIImage?
    @State private var saved = false

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            Group {
                if let img = uiImage {
                    Image(uiImage: img).resizable().scaledToFit()
                } else if source.hasPrefix("data:"), let img = UIImage.fromDataURL(source) {
                    Image(uiImage: img).resizable().scaledToFit()
                        .onAppear { uiImage = img }
                } else if let url = URL(string: source) {
                    AsyncImage(url: url) { phase in
                        if case .success(let image) = phase {
                            image.resizable().scaledToFit()
                        } else { ProgressView().tint(.white) }
                    }
                }
            }
            .scaleEffect(scale)
            .offset(offset)
            .gesture(
                MagnificationGesture()
                    .onChanged { v in scale = min(max(lastScale * v, 1), 5) }
                    .onEnded { _ in lastScale = scale; if scale <= 1 { withAnimation { offset = .zero; lastOffset = .zero } } }
            )
            .simultaneousGesture(
                DragGesture()
                    .onChanged { v in if scale > 1 { offset = CGSize(width: lastOffset.width + v.translation.width, height: lastOffset.height + v.translation.height) } }
                    .onEnded { _ in lastOffset = offset }
            )
            .onTapGesture(count: 2) {
                withAnimation(.spring) {
                    if scale > 1 { scale = 1; lastScale = 1; offset = .zero; lastOffset = .zero }
                    else { scale = 2.5; lastScale = 2.5 }
                }
            }

            VStack {
                HStack {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark").font(.system(size: 16, weight: .bold))
                            .foregroundStyle(.white).frame(width: 40, height: 40)
                            .background(.ultraThinMaterial, in: Circle())
                    }
                    Spacer()
                    if let img = currentImage() {
                        ShareLink(item: Image(uiImage: img), preview: SharePreview("AskAI image", image: Image(uiImage: img))) {
                            Image(systemName: "square.and.arrow.up").font(.system(size: 16, weight: .bold))
                                .foregroundStyle(.white).frame(width: 40, height: 40)
                                .background(.ultraThinMaterial, in: Circle())
                        }
                    }
                    Button { save() } label: {
                        Image(systemName: saved ? "checkmark" : "square.and.arrow.down").font(.system(size: 16, weight: .bold))
                            .foregroundStyle(.white).frame(width: 40, height: 40)
                            .background(.ultraThinMaterial, in: Circle())
                    }
                }
                .padding(.horizontal, 16).padding(.top, 8)
                Spacer()
            }
        }
        .task { await load() }
    }

    private func currentImage() -> UIImage? {
        if let uiImage { return uiImage }
        if source.hasPrefix("data:") { return UIImage.fromDataURL(source) }
        return nil
    }

    private func load() async {
        if uiImage != nil { return }
        if source.hasPrefix("data:") { uiImage = UIImage.fromDataURL(source); return }
        if let url = URL(string: source), let (data, _) = try? await URLSession.shared.data(from: url) {
            uiImage = UIImage(data: data)
        }
    }

    private func save() {
        guard let img = currentImage() else { return }
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
            guard status == .authorized || status == .limited else { return }
            UIImageWriteToSavedPhotosAlbum(img, nil, nil, nil)
            Task { @MainActor in
                saved = true
                UINotificationFeedbackGenerator().notificationOccurred(.success)
            }
        }
    }
}
