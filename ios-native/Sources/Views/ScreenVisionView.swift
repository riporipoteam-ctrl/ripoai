import SwiftUI
import ReplayKit

/// Screen → AI. The user starts a system screen broadcast; the broadcast
/// extension writes frames into the shared App Group container and this screen
/// polls them, sending the latest to the vision model so AskAI can see and
/// answer about whatever is on screen — across any app.
struct ScreenVisionView: View {
    @EnvironmentObject var store: AppStore
    @Environment(\.dismiss) private var dismiss
    @StateObject private var voice = VoiceOut()

    @State private var prompt = "What's on my screen?"
    @State private var answer = ""
    @State private var thinking = false
    @State private var live = false
    @State private var speak = true
    @State private var lastFrame: UIImage?
    @State private var pollTimer: Timer?
    @State private var liveTask: Task<Void, Never>?

    var body: some View {
        ZStack {
            LinearGradient(colors: [Color(hex: 0x0B0B0C), Color(hex: 0x18181C)],
                           startPoint: .top, endPoint: .bottom).ignoresSafeArea()

            VStack(spacing: 16) {
                // Top bar
                HStack {
                    Button { close() } label: {
                        Image(systemName: "xmark").font(.system(size: 16, weight: .bold))
                            .foregroundStyle(.white).frame(width: 40, height: 40)
                            .background(.white.opacity(0.12), in: Circle())
                    }
                    Spacer()
                    HStack(spacing: 7) {
                        Image(systemName: "rectangle.inset.filled.on.rectangle").font(.system(size: 13, weight: .bold))
                        Text("Screen Vision").font(.system(size: 14, weight: .bold))
                    }.foregroundStyle(.white)
                    Spacer()
                    Button { speak.toggle() } label: {
                        Image(systemName: speak ? "speaker.wave.2.fill" : "speaker.slash.fill")
                            .font(.system(size: 15, weight: .bold))
                            .foregroundStyle(.white).frame(width: 40, height: 40)
                            .background(.white.opacity(0.12), in: Circle())
                    }
                }
                .padding(.horizontal, 16).padding(.top, 10)

                // Preview of what AskAI sees
                ZStack {
                    RoundedRectangle(cornerRadius: 20, style: .continuous).fill(.white.opacity(0.06))
                    if let f = lastFrame {
                        Image(uiImage: f).resizable().scaledToFit()
                            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                    } else {
                        VStack(spacing: 12) {
                            Image(systemName: "rectangle.dashed.badge.record")
                                .font(.system(size: 36)).foregroundStyle(.white.opacity(0.7))
                            Text(ScreenShare.isAvailable
                                 ? store.t("Tap “Share my screen”, choose AskAI Screen,\nthen return here — AskAI will see your screen.")
                                 : store.t("Screen sharing needs the App Group enabled when\nyou sign the app. Live Camera works without it."))
                                .font(.system(size: 13)).foregroundStyle(.white.opacity(0.65))
                                .multilineTextAlignment(.center)
                        }.padding(24)
                    }
                }
                .frame(maxHeight: 320).padding(.horizontal, 16)

                // Answer
                if !answer.isEmpty || thinking {
                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: "sparkles").foregroundStyle(.white).font(.system(size: 15, weight: .bold))
                        Text(thinking && answer.isEmpty ? store.t("Looking…") : answer)
                            .font(.system(size: 15)).foregroundStyle(.white)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .padding(14)
                    .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .padding(.horizontal, 16)
                }

                Spacer()

                // System broadcast picker (start/stop screen share)
                BroadcastButton()
                    .frame(height: 52).padding(.horizontal, 16)

                // Ask
                HStack(spacing: 10) {
                    TextField(store.t("Ask about your screen…"), text: $prompt)
                        .font(.system(size: 15)).foregroundStyle(.white)
                        .padding(.horizontal, 14).padding(.vertical, 11)
                        .background(.white.opacity(0.12), in: Capsule()).tint(.white)
                    Button { Task { await askOnce() } } label: {
                        Image(systemName: "arrow.up").font(.system(size: 18, weight: .heavy))
                            .foregroundStyle(.black).frame(width: 46, height: 46)
                            .background(Circle().fill(.white))
                    }.disabled(lastFrame == nil || thinking)
                }
                .padding(.horizontal, 16)

                Button { toggleLive() } label: {
                    HStack(spacing: 8) {
                        Image(systemName: live ? "stop.fill" : "dot.radiowaves.left.and.right")
                        Text(live ? store.t("Stop live narration") : store.t("Narrate my screen live"))
                            .font(.system(size: 14, weight: .bold))
                    }
                    .foregroundStyle(live ? .red : .white)
                    .padding(.horizontal, 18).padding(.vertical, 11)
                    .background(.white.opacity(0.08), in: Capsule())
                }
                .disabled(lastFrame == nil && !live)
                .padding(.bottom, 16)
            }
        }
        .statusBarHidden(true)
        .onAppear { startPolling() }
        .onDisappear { stopAll() }
        .animation(.easeInOut, value: answer.isEmpty)
        .animation(.easeInOut, value: live)
    }

    private func startPolling() {
        pollTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in
            if let data = ScreenShare.latestFrame(), let img = UIImage(data: data) {
                lastFrame = img
            }
        }
    }

    private func close() { stopAll(); dismiss() }
    private func stopAll() {
        pollTimer?.invalidate(); pollTimer = nil
        liveTask?.cancel(); liveTask = nil
        voice.stop()
        LiveActivityManager.shared.end()
    }

    private func toggleLive() {
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        if live {
            live = false; liveTask?.cancel(); liveTask = nil
            LiveActivityManager.shared.end()
        } else {
            live = true
            LiveActivityManager.shared.start(title: "Screen Vision", status: "Narrating your screen", progress: 0)
            liveTask = Task {
                while !Task.isCancelled && live {
                    await ask(prompt.isEmpty ? "Briefly describe what's on screen." : prompt)
                    try? await Task.sleep(nanoseconds: 2_000_000_000)
                }
            }
        }
    }

    private func askOnce() async {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        await ask(prompt.isEmpty ? "What's on my screen?" : prompt)
    }

    private func ask(_ q: String) async {
        guard !thinking, let frame = lastFrame,
              let jpeg = frame.resized(maxSide: 1024).jpegData(compressionQuality: 0.6) else { return }
        thinking = true; answer = ""
        let dataURL = "data:image/jpeg;base64,\(jpeg.base64EncodedString())"
        let system = Message(role: .system, text:
            "You are AskAI looking at the user's phone screen. Answer about what you see in one or two short, natural sentences. No markdown.")
        let user = Message(role: .user, text: q, attachments: [dataURL])
        do {
            try await GroqClient.shared.stream(model: AIModel.visionModel.backend,
                                               provider: AIModel.visionModel.provider,
                                               messages: [system, user]) { token in answer += token }
        } catch {
            answer = "I couldn't read the screen — try again."
        }
        thinking = false
        if speak && !answer.isEmpty { voice.speak(answer) {} }
    }
}

/// Wraps RPSystemBroadcastPickerView so the user can start/stop a screen
/// broadcast straight into the AskAI Screen extension.
struct BroadcastButton: UIViewRepresentable {
    func makeUIView(context: Context) -> UIView {
        let container = UIView()
        let picker = RPSystemBroadcastPickerView(frame: .zero)
        picker.preferredExtension = "io.github.riporipoteam.ripoai.broadcast"
        picker.showsMicrophoneButton = false
        picker.translatesAutoresizingMaskIntoConstraints = false

        let label = UILabel()
        label.text = "  Share my screen"
        label.font = .systemFont(ofSize: 16, weight: .bold)
        label.textColor = .white

        let stack = UIStackView(arrangedSubviews: [picker, label])
        stack.alignment = .center
        stack.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(stack)
        container.backgroundColor = UIColor.white.withAlphaComponent(0.12)
        container.layer.cornerRadius = 16

        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: container.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: container.centerYAnchor),
            picker.widthAnchor.constraint(equalToConstant: 44),
            picker.heightAnchor.constraint(equalToConstant: 44),
        ])
        return container
    }
    func updateUIView(_ uiView: UIView, context: Context) {}
}
