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
        let frame = cameraOn ? camera.latestDataURL() : nil
        let userMsg = Message(role: .user, text: text, attachments: frame.map { [$0] } ?? [])
        convo.append(userMsg)
        let model = frame != nil ? AIModel.visionModel.backend : "llama-3.3-70b-versatile"
        let provider: Provider = frame != nil ? AIModel.visionModel.provider : .groq

        voice.begin(language: store.language)
        var out = ""
        var spokenUpTo = ""            // index into `out` already sent to TTS
        var startedSpeaking = false
        do {
            try await GroqClient.shared.stream(model: model, provider: provider, messages: convo) { tok in
                out += tok
                lastReply = out
                // Speak complete sentences as they arrive → it talks back fast.
                if let chunk = Self.nextSentence(in: out, after: spokenUpTo) {
                    spokenUpTo += chunk
                    if !startedSpeaking { startedSpeaking = true; state = .speaking }
                    voice.enqueue(chunk)
                }
            }
        } catch { out = out.isEmpty ? "Sorry, I didn't catch that." : out }
        // Speak any trailing remainder.
        let rest = String(out.dropFirst(spokenUpTo.count))
        if !rest.trimmingCharacters(in: .whitespaces).isEmpty {
            state = .speaking; voice.enqueue(rest)
        }
        convo.append(Message(role: .assistant, text: out))
        if let idx = convo.firstIndex(where: { $0.id == userMsg.id }) { convo[idx].attachments = [] }
        lastReply = out
        if !startedSpeaking && rest.isEmpty { state = .listening; speech.start(); return }
        voice.finish {
            Task { @MainActor in state = .listening; speech.start() }
        }
    }

    /// Returns the next full sentence at the start of `text` beyond `consumed`.
    private static func nextSentence(in text: String, after consumed: String) -> String? {
        guard text.count > consumed.count else { return nil }
        let remainder = text.dropFirst(consumed.count)
        if let r = remainder.firstIndex(where: { ".!?\n".contains($0) }) {
            let end = remainder.index(after: r)
            let sentence = String(remainder[remainder.startIndex..<end])
            // Only emit once we have a bit of text (avoid choppy one-word chunks).
            return sentence.count >= 4 ? sentence : nil
        }
        return nil
    }
}

/// Text-to-speech: picks the best (premium/enhanced) voice for the language and
/// can speak incrementally (sentence-by-sentence) so replies start instantly.
@MainActor
final class VoiceOut: NSObject, ObservableObject, AVSpeechSynthesizerDelegate {
    private let synth = AVSpeechSynthesizer()
    private var onAllDone: (() -> Void)?
    private var pending = 0
    private var finishing = false
    private var langCode = "en-US"

    override init() { super.init(); synth.delegate = self }

    /// Start a fresh spoken turn in the given app-language.
    func begin(language: String) {
        langCode = Self.ttsLocale(language)
        finishing = false; pending = 0
        try? AVAudioSession.sharedInstance().setCategory(.playback, options: .duckOthers)
        try? AVAudioSession.sharedInstance().setActive(true)
    }

    /// Speak one chunk (queued — earlier chunks finish first).
    func enqueue(_ text: String) {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return }
        let u = AVSpeechUtterance(string: t)
        u.voice = Self.bestVoice(for: langCode)
        u.rate = 0.5
        pending += 1
        synth.speak(u)
    }

    /// No more chunks coming — call done once everything has been spoken.
    func finish(done: @escaping () -> Void) { onAllDone = done; finishing = true; checkDone() }

    /// One-shot convenience (used by camera/screen vision).
    func speak(_ text: String, done: @escaping () -> Void) {
        begin(language: "auto"); enqueue(text); finish(done: done)
    }

    func stop() { synth.stopSpeaking(at: .immediate); pending = 0; finishing = false; onAllDone = nil }

    private func checkDone() {
        if finishing && pending == 0 { let d = onAllDone; onAllDone = nil; finishing = false; d?() }
    }
    nonisolated func speechSynthesizer(_ s: AVSpeechSynthesizer, didFinish u: AVSpeechUtterance) {
        Task { @MainActor in self.pending -= 1; self.checkDone() }
    }

    /// Highest-quality installed voice for a language (premium > enhanced > default).
    static func bestVoice(for lang: String) -> AVSpeechSynthesisVoice? {
        let base = String(lang.prefix(2)).lowercased()
        let voices = AVSpeechSynthesisVoice.speechVoices().filter { $0.language.lowercased().hasPrefix(base) }
        func rank(_ q: AVSpeechSynthesisVoice.Quality) -> Int {
            if #available(iOS 16.0, *), q == .premium { return 3 }
            return q == .enhanced ? 2 : 1
        }
        return voices.max(by: { rank($0.quality) < rank($1.quality) }) ?? AVSpeechSynthesisVoice(language: lang)
    }

    /// Map an app-language selection to a TTS locale.
    static func ttsLocale(_ selection: String) -> String {
        let code = selection == "auto" ? (Languages.device().code) : selection
        let map: [String: String] = ["en": "en-US", "es": "es-ES", "fr": "fr-FR", "de": "de-DE",
            "it": "it-IT", "pt": "pt-BR", "ru": "ru-RU", "ja": "ja-JP", "ko": "ko-KR",
            "zh": "zh-CN", "ar": "ar-SA", "hi": "hi-IN", "nl": "nl-NL", "tr": "tr-TR",
            "pl": "pl-PL", "sv": "sv-SE", "da": "da-DK", "fi": "fi-FI", "no": "nb-NO",
            "cs": "cs-CZ", "el": "el-GR", "he": "he-IL", "th": "th-TH", "id": "id-ID",
            "uk": "uk-UA", "ro": "ro-RO", "hu": "hu-HU", "vi": "vi-VN"]
        return map[code] ?? "en-US"
    }
}
