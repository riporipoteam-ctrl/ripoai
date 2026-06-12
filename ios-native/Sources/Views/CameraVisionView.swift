import SwiftUI
import AVFoundation

/// Live camera vision: AskAI looks through the camera and answers questions
/// about what it sees — tap to ask, or turn on Live to have it narrate
/// continuously. Streams the answer and can speak it aloud.
struct CameraVisionView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var cam = CameraVisionModel()
    @StateObject private var voice = VoiceOut()

    @State private var prompt = "What am I looking at?"
    @State private var answer = ""
    @State private var thinking = false
    @State private var live = false
    @State private var speak = true
    @State private var liveTask: Task<Void, Never>?

    var body: some View {
        ZStack {
            CameraPreview(session: cam.session).ignoresSafeArea()

            // Dark gradient for legibility
            LinearGradient(colors: [.black.opacity(0.55), .clear, .black.opacity(0.75)],
                           startPoint: .top, endPoint: .bottom).ignoresSafeArea()

            VStack(spacing: 0) {
                // Top bar
                HStack {
                    Button { close() } label: {
                        Image(systemName: "xmark").font(.system(size: 16, weight: .bold))
                            .foregroundStyle(.white).frame(width: 40, height: 40)
                            .background(.white.opacity(0.15), in: Circle())
                    }
                    Spacer()
                    HStack(spacing: 7) {
                        Circle().fill(live ? .red : .white.opacity(0.4)).frame(width: 8, height: 8)
                        Text(live ? "LIVE" : "AskAI Vision").font(.system(size: 13, weight: .bold))
                            .foregroundStyle(.white)
                    }
                    .padding(.horizontal, 12).padding(.vertical, 7)
                    .background(.black.opacity(0.35), in: Capsule())
                    Spacer()
                    Button { speak.toggle() } label: {
                        Image(systemName: speak ? "speaker.wave.2.fill" : "speaker.slash.fill")
                            .font(.system(size: 15, weight: .bold))
                            .foregroundStyle(.white).frame(width: 40, height: 40)
                            .background(.white.opacity(0.15), in: Circle())
                    }
                }
                .padding(.horizontal, 16).padding(.top, 8)

                Spacer()

                // Answer card
                if !answer.isEmpty || thinking {
                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: "sparkles").font(.system(size: 15, weight: .bold))
                            .foregroundStyle(.white)
                        Text(thinking && answer.isEmpty ? "Looking…" : answer)
                            .font(.system(size: 15)).foregroundStyle(.white)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .padding(14)
                    .background(.black.opacity(0.55), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .padding(.horizontal, 16).padding(.bottom, 10)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                }

                // Prompt + controls
                HStack(spacing: 10) {
                    TextField("Ask about what you see…", text: $prompt)
                        .font(.system(size: 15)).foregroundStyle(.white)
                        .padding(.horizontal, 14).padding(.vertical, 11)
                        .background(.white.opacity(0.15), in: Capsule())
                        .tint(.white)

                    Button { Task { await askOnce() } } label: {
                        Image(systemName: "arrow.up").font(.system(size: 18, weight: .heavy))
                            .foregroundStyle(.black).frame(width: 46, height: 46)
                            .background(Circle().fill(.white))
                    }.disabled(thinking && !live)
                }
                .padding(.horizontal, 16)

                // Live toggle
                Button { toggleLive() } label: {
                    HStack(spacing: 8) {
                        Image(systemName: live ? "stop.fill" : "dot.radiowaves.left.and.right")
                        Text(live ? "Stop live narration" : "Start live narration")
                            .font(.system(size: 14, weight: .bold))
                    }
                    .foregroundStyle(live ? .red : .white)
                    .padding(.horizontal, 18).padding(.vertical, 11)
                    .background(.black.opacity(0.4), in: Capsule())
                    .overlay(Capsule().strokeBorder(.white.opacity(0.2), lineWidth: 1))
                }
                .padding(.top, 12).padding(.bottom, 18)
            }
        }
        .statusBarHidden(true)
        .onAppear { cam.configure() }
        .onDisappear { liveTask?.cancel(); cam.stop() }
        .animation(.spring(response: 0.35), value: answer.isEmpty)
        .animation(.easeInOut, value: live)
    }

    private func close() {
        liveTask?.cancel(); voice.stop(); cam.stop()
        LiveActivityManager.shared.end()
        dismiss()
    }

    private func toggleLive() {
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        if live {
            live = false; liveTask?.cancel(); liveTask = nil
            LiveActivityManager.shared.end()
        } else {
            live = true
            LiveActivityManager.shared.start(title: "AskAI Vision", status: "Live narration", progress: 0)
            liveTask = Task {
                while !Task.isCancelled && live {
                    await ask(prompt.isEmpty ? "Briefly narrate what you see." : prompt)
                    try? await Task.sleep(nanoseconds: 1_500_000_000)
                }
            }
        }
    }

    private func askOnce() async {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        await ask(prompt.isEmpty ? "What am I looking at?" : prompt)
    }

    private func ask(_ q: String) async {
        guard !thinking else { return }
        thinking = true; answer = ""
        guard let frame = await cam.capture(),
              let jpeg = frame.resized(maxSide: 1024).jpegData(compressionQuality: 0.6) else {
            answer = "Couldn't capture the camera."; thinking = false; return
        }
        let dataURL = "data:image/jpeg;base64,\(jpeg.base64EncodedString())"
        let system = Message(role: .system, text:
            "You are AskAI looking through the user's live camera. Answer about what you see in one or two short, natural spoken sentences. No markdown, no lists.")
        let user = Message(role: .user, text: q, attachments: [dataURL])
        do {
            try await GroqClient.shared.stream(model: AIModel.visionModel.backend,
                                               provider: AIModel.visionModel.provider,
                                               messages: [system, user]) { token in
                answer += token
            }
        } catch {
            answer = "I couldn't make that out — try again."
        }
        thinking = false
        if speak && !answer.isEmpty { voice.speak(answer) {} }
    }
}

/// UIKit camera preview layer bridged into SwiftUI.
struct CameraPreview: UIViewRepresentable {
    let session: AVCaptureSession
    func makeUIView(context: Context) -> PreviewView {
        let v = PreviewView()
        v.previewLayer.session = session
        v.previewLayer.videoGravity = .resizeAspectFill
        return v
    }
    func updateUIView(_ uiView: PreviewView, context: Context) {
        uiView.previewLayer.session = session
    }
    final class PreviewView: UIView {
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        var previewLayer: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
    }
}

/// Manages the capture session and grabs single frames on demand.
@MainActor
final class CameraVisionModel: NSObject, ObservableObject {
    let session = AVCaptureSession()
    private let output = AVCapturePhotoOutput()
    private let queue = DispatchQueue(label: "askai.camera.vision")
    private var cont: CheckedContinuation<UIImage?, Never>?

    func configure() {
        AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
            guard granted, let self else { return }
            self.queue.async {
                self.session.beginConfiguration()
                self.session.sessionPreset = .photo
                if let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
                   let input = try? AVCaptureDeviceInput(device: device),
                   self.session.canAddInput(input) {
                    self.session.addInput(input)
                }
                if self.session.canAddOutput(self.output) { self.session.addOutput(self.output) }
                self.session.commitConfiguration()
                self.session.startRunning()
            }
        }
    }

    func stop() {
        queue.async { [weak self] in
            guard let self, self.session.isRunning else { return }
            self.session.stopRunning()
        }
    }

    func capture() async -> UIImage? {
        guard session.isRunning else { return nil }
        return await withCheckedContinuation { c in
            self.cont = c
            let settings = AVCapturePhotoSettings()
            self.output.capturePhoto(with: settings, delegate: self)
        }
    }
}

extension CameraVisionModel: AVCapturePhotoCaptureDelegate {
    nonisolated func photoOutput(_ output: AVCapturePhotoOutput,
                                 didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        let img = photo.fileDataRepresentation().flatMap { UIImage(data: $0) }
        Task { @MainActor [weak self] in
            self?.cont?.resume(returning: img)
            self?.cont = nil
        }
    }
}
