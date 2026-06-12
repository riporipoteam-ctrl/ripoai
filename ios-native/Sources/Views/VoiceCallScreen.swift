import SwiftUI
import AVFoundation

/// Live voice call: speak → AskAI replies in text + speaks it aloud, with a
/// reactive glowing orb. Speech-to-text in, AVSpeechSynthesizer out.
struct VoiceCallScreen: View {
    @EnvironmentObject var store: AppStore
    @Environment(\.dismiss) private var dismiss
    @StateObject private var speech = SpeechInput()
    @StateObject private var voice = VoiceOut()
    @StateObject private var camera = CameraFrameProvider()

    @State private var state: CallState = .listening
    @State private var lastReply = ""
    @State private var animate = false
    @State private var cameraOn = false
    @State private var convo: [Message] = [
        Message(role: .system, text: "You are AskAI on a live voice call. Reply in short, natural, spoken sentences — no markdown, no lists, no long monologues."),
    ]
    enum CallState { case listening, thinking, speaking }

    var body: some View {
        ZStack {
            LinearGradient(colors: [Color(hex: 0x0B0B0C), Color(hex: 0x1A1A1E)], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()

            // Live camera feed fills the screen during a video call so AskAI sees.
            if cameraOn {
                CameraPreview(session: camera.session)
                    .ignoresSafeArea()
                    .overlay(Color.black.opacity(0.35).ignoresSafeArea())
                    .transition(.opacity)
            }

            VStack(spacing: 26) {
                Spacer()
                // Reactive orb
                ZStack {
                    ForEach(0..<3) { i in
                        Circle()
                            .fill(Color.white.opacity(0.06))
                            .frame(width: 170 + CGFloat(i) * 60, height: 170 + CGFloat(i) * 60)
                            .scaleEffect(animate ? 1.12 : 0.92)
                            .animation(.easeInOut(duration: 1.4 + Double(i) * 0.3).repeatForever(autoreverses: true), value: animate)
                    }
                    Circle()
                        .fill(RadialGradient(colors: orbColors, center: .center, startRadius: 4, endRadius: 110))
                        .frame(width: 160, height: 160)
                        .scaleEffect(state == .speaking ? (animate ? 1.08 : 0.96) : 1)
                        .shadow(color: orbColors.first!.opacity(0.6), radius: 40)
                    Image(systemName: stateIcon)
                        .font(.system(size: 42, weight: .bold))
                        .foregroundStyle(.white)
                        .symbolEffect(.pulse, isActive: state != .speaking)
                }

                Text(stateLabel).font(.system(size: 16, weight: .semibold)).foregroundStyle(.white.opacity(0.85))
                if !lastReply.isEmpty {
                    Text(lastReply).font(.system(size: 15)).foregroundStyle(.white.opacity(0.7))
                        .multilineTextAlignment(.center).padding(.horizontal, 36).lineLimit(4)
                }
                Spacer()

                // Controls
                HStack(spacing: 26) {
                    Button { speech.toggle() } label: {
                        Image(systemName: speech.isRecording ? "mic.fill" : "mic.slash.fill")
                            .font(.system(size: 20, weight: .bold)).foregroundStyle(.white)
                            .frame(width: 58, height: 58).background(.white.opacity(0.12), in: Circle())
                    }
                    // Camera on/off — turns the call into a video call AskAI can see.
                    Button {
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        cameraOn.toggle()
                        if cameraOn { camera.start(position: .back) } else { camera.stop() }
                    } label: {
                        Image(systemName: cameraOn ? "video.fill" : "video.slash.fill")
                            .font(.system(size: 20, weight: .bold)).foregroundStyle(cameraOn ? .black : .white)
                            .frame(width: 58, height: 58)
                            .background(cameraOn ? AnyShapeStyle(.white) : AnyShapeStyle(.white.opacity(0.12)), in: Circle())
                    }
                    if cameraOn {
                        Button { camera.flip() } label: {
                            Image(systemName: "arrow.triangle.2.circlepath.camera.fill")
                                .font(.system(size: 18, weight: .bold)).foregroundStyle(.white)
                                .frame(width: 58, height: 58).background(.white.opacity(0.12), in: Circle())
                        }
                    }
                    Button {
                        speech.stop(); voice.stop(); camera.stop()
                        LiveActivityManager.shared.end()
                        dismiss()
                    } label: {
                        Image(systemName: "phone.down.fill")
                            .font(.system(size: 22, weight: .bold)).foregroundStyle(.white)
                            .frame(width: 64, height: 64).background(Color.red, in: Circle())
                    }
                }
                .padding(.bottom, 40)
            }
        }
        .onAppear {
            animate = true
            speech.start()
            if let lang = Languages.instructionName(store.language), !convo.isEmpty {
                convo[0] = Message(role: .system, text: convo[0].text + " Always respond in \(lang).")
            }
            LiveActivityManager.shared.start(title: "Voice call", status: "Listening…",
                                             isVoiceCall: true)
        }
        .onDisappear { camera.stop(); LiveActivityManager.shared.end() }
        .animation(.easeInOut, value: cameraOn)
        .onChange(of: state) { _, s in
            LiveActivityManager.shared.update(status: stateLabel, isVoiceCall: true)
        }
        .onChange(of: speech.isRecording) { _, recording in
            // When the user stops talking (recognizer ends), send what we heard.
            if !recording, state == .listening, !speech.transcript.trimmingCharacters(in: .whitespaces).isEmpty {
                Task { await reply(to: speech.transcript) }
            }
        }
    }

    private var orbColors: [Color] {
        switch state {
        case .listening: return [Color(hex: 0x4F7CFF), Color(hex: 0x7A5CFF)]
        case .thinking: return [Color(hex: 0xFFB020), Color(hex: 0xFF7A3D)]
        case .speaking: return [Color(hex: 0x35D07F), Color(hex: 0x2AA8C8)]
        }
    }
    private var stateIcon: String {
        switch state { case .listening: return "waveform"; case .thinking: return "ellipsis"; case .speaking: return "speaker.wave.2.fill" }
    }
    private var stateLabel: String {
        switch state { case .listening: return "Listening…"; case .thinking: return "Thinking…"; case .speaking: return "AskAI is speaking" }
    }

    private func reply(to text: String) async {
        state = .thinking
        // When the camera is on, attach the latest frame so AskAI can see.
        let frame = cameraOn ? camera.latestDataURL() : nil
        let userMsg = Message(role: .user, text: text, attachments: frame.map { [$0] } ?? [])
        convo.append(userMsg)
        let model = frame != nil ? AIModel.visionModel.backend : "llama-3.3-70b-versatile"
        let provider: Provider = frame != nil ? AIModel.visionModel.provider : .groq
        var out = ""
        do {
            try await GroqClient.shared.stream(model: model, provider: provider, messages: convo) { out += $0 }
        } catch { out = "Sorry, I didn't catch that." }
        convo.append(Message(role: .assistant, text: out))
        // Drop the frame from history so old images don't pile up in context.
        if let idx = convo.firstIndex(where: { $0.id == userMsg.id }) { convo[idx].attachments = [] }
        lastReply = out
        state = .speaking
        voice.speak(out) {
            Task { @MainActor in
                state = .listening
                speech.start()
            }
        }
    }
}

/// Text-to-speech wrapper.
@MainActor
final class VoiceOut: NSObject, ObservableObject, AVSpeechSynthesizerDelegate {
    private let synth = AVSpeechSynthesizer()
    private var onDone: (() -> Void)?
    override init() { super.init(); synth.delegate = self }

    func speak(_ text: String, done: @escaping () -> Void) {
        onDone = done
        try? AVAudioSession.sharedInstance().setCategory(.playback, options: .duckOthers)
        try? AVAudioSession.sharedInstance().setActive(true)
        let u = AVSpeechUtterance(string: text)
        u.voice = AVSpeechSynthesisVoice(language: "en-US")
        u.rate = 0.52
        synth.speak(u)
    }
    func stop() { synth.stopSpeaking(at: .immediate) }
    nonisolated func speechSynthesizer(_ s: AVSpeechSynthesizer, didFinish u: AVSpeechUtterance) {
        Task { @MainActor in onDone?(); onDone = nil }
    }
}
