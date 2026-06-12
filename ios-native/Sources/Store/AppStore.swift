import SwiftUI
import UIKit

enum StreamPhase { case idle, thinking, searching, generating, writing }

@MainActor
final class AppStore: ObservableObject {
    @Published var sessions: [ChatSession] = []
    @Published var currentID: UUID?
    @Published var model: AIModel = .default
    @Published var webSearch = false
    @Published var imageMode = false
    @Published var agentMode = false
    @Published var pendingAttachments: [String] = []   // base64 data URLs
    @Published var isStreaming = false
    @Published var phase: StreamPhase = .idle
    @Published var errorText: String?
    @Published var requestVoiceCall = false            // present voice-call full screen
    @Published var requestLiveCamera = false           // present live camera vision full screen
    @Published var appearance = "system"               // system | light | dark
    @Published var notifyOnComplete = false
    @Published var aiCheckins = "off"                   // off | daily | weekly | monthly
    @Published var locationEnabled = false
    @Published var verbosity = "balanced"               // concise | balanced | detailed
    @Published var tone = "friendly"                    // professional | friendly | playful | direct
    @Published var customInstructions = ""

    // Account / cloud sync
    @Published var user: AuthUser?
    @Published var guest = false
    @Published var authBusy = false

    private let saveKey = "askai.sessions.v1"
    private let userKey = "askai.user.v1"
    private let guestKey = "askai.guest.v1"
    private let appearanceKey = "askai.appearance"
    private let verbosityKey = "askai.verbosity"
    private let toneKey = "askai.tone"
    private let customKey = "askai.custom"
    private let modelKey = "askai.model"
    private let notifyKey = "askai.notify"
    private let checkinKey = "askai.checkins"
    private let locKey = "askai.location"
    private var streamTask: Task<Void, Never>?

    var colorScheme: ColorScheme? {
        appearance == "light" ? .light : appearance == "dark" ? .dark : nil
    }

    init() {
        load()
        appearance = UserDefaults.standard.string(forKey: appearanceKey) ?? "system"
        verbosity = UserDefaults.standard.string(forKey: verbosityKey) ?? "balanced"
        tone = UserDefaults.standard.string(forKey: toneKey) ?? "friendly"
        customInstructions = UserDefaults.standard.string(forKey: customKey) ?? ""
        if let mid = UserDefaults.standard.string(forKey: modelKey), let m = AIModel.byID(mid) { model = m }
        notifyOnComplete = UserDefaults.standard.bool(forKey: notifyKey)
        aiCheckins = UserDefaults.standard.string(forKey: checkinKey) ?? "off"
        locationEnabled = UserDefaults.standard.bool(forKey: locKey)
        // Screenshot/demo mode for CI: seed content, skip auth.
        let args = ProcessInfo.processInfo.arguments
        if args.contains("-demo-chat") || args.contains("-demo-home") || args.contains("-demo-settings") || args.contains("-demo-menu") || args.contains("-demo-plus") {
            guest = true
            sessions = []
            if args.contains("-demo-menu") {
                sessions = [
                    ChatSession(title: "Plan a trip to Tokyo"),
                    ChatSession(title: "Logo design ideas"),
                    ChatSession(title: "Explain quantum entanglement"),
                    ChatSession(title: "Swift async/await help"),
                    ChatSession(title: "Best cheap hotels in NYC"),
                ]
            }
            if args.contains("-demo-chat") {
                var s = ChatSession(title: "Plan a trip to Tokyo")
                s.messages = [
                    Message(role: .user, text: "Plan a 3-day trip to Tokyo on a budget"),
                    Message(role: .assistant, text: "Here’s a tight, budget-friendly plan:\n\n**Day 1 — Classic Tokyo**\n- Senso-ji Temple (free)\n- Walk Nakamise street, snack lunch ¥800\n- Ueno Park + museums\n\n**Day 2 — Modern Tokyo**\n- Shibuya Crossing & Hachiko\n- Harajuku, Takeshita street\n- Evening: Shinjuku Omoide Yokocho\n\n**Day 3 — Day trip**\n- Kamakura Great Buddha (¥980 round trip)\n\nBudget: about **¥9,000/day** with a 72-hour metro pass.\n\nUseful links: [Tokyo Metro passes](https://www.tokyometro.jp/en/ticket/travel/) and [Senso-ji info](https://www.senso-ji.jp/english/)."),
                ]
                sessions = [s]
            }
            if sessions.isEmpty { newChat() }
            currentID = sessions.first?.id
            return
        }
        if sessions.isEmpty { newChat() }
        currentID = sessions.first?.id
        guest = UserDefaults.standard.bool(forKey: guestKey)
        loadUser()
        if let u = user {
            Task {
                if let fresh = try? await AuthService.refresh(u) {
                    self.user = fresh; self.persistUser()
                    await self.pullCloud()
                }
            }
        }
    }

    var current: ChatSession? {
        guard let id = currentID else { return nil }
        return sessions.first(where: { $0.id == id })
    }

    func setAppearance(_ v: String) {
        appearance = v
        UserDefaults.standard.set(v, forKey: appearanceKey)
    }

    func setVerbosity(_ v: String) {
        verbosity = v
        UserDefaults.standard.set(v, forKey: verbosityKey)
    }

    func setTone(_ v: String) {
        tone = v
        UserDefaults.standard.set(v, forKey: toneKey)
    }

    func setCustomInstructions(_ v: String) {
        customInstructions = v
        UserDefaults.standard.set(v, forKey: customKey)
    }

    func setModel(_ m: AIModel) {
        model = m
        UserDefaults.standard.set(m.id, forKey: modelKey)
    }

    func setNotifyOnComplete(_ on: Bool) {
        notifyOnComplete = on
        UserDefaults.standard.set(on, forKey: notifyKey)
        if on { Task { _ = await NotificationManager.shared.requestAuth() } }
    }

    func setCheckins(_ freq: String) {
        aiCheckins = freq
        UserDefaults.standard.set(freq, forKey: checkinKey)
        Task {
            if freq != "off" { _ = await NotificationManager.shared.requestAuth() }
            NotificationManager.shared.scheduleCheckins(freq)
        }
    }

    func setLocationEnabled(_ on: Bool) {
        locationEnabled = on
        UserDefaults.standard.set(on, forKey: locKey)
        if on { LocationManager.shared.request() }
    }

    func newChat() {
        let s = ChatSession()
        sessions.insert(s, at: 0)
        currentID = s.id
        save()
    }

    func select(_ id: UUID) { currentID = id }

    func delete(_ id: UUID) {
        sessions.removeAll { $0.id == id }
        if currentID == id { currentID = sessions.first?.id }
        if sessions.isEmpty { newChat() }
        save()
    }

    private func update(_ id: UUID, _ change: (inout ChatSession) -> Void) {
        guard let idx = sessions.firstIndex(where: { $0.id == id }) else { return }
        change(&sessions[idx])
        sessions[idx].updated = Date()
        sessions.sort { $0.updated > $1.updated }
    }

    // MARK: Sending

    func send(_ raw: String) {
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        let images = pendingAttachments
        guard (!text.isEmpty || !images.isEmpty), !isStreaming, let id = currentID else { return }
        pendingAttachments = []

        if images.isEmpty && (imageMode || looksLikeImageRequest(text)) {
            runImageGeneration(prompt: text, id: id)
            return
        }
        update(id) { s in
            s.messages.append(Message(role: .user, text: text, attachments: images))
            if s.title == "New chat" { s.title = String((text.isEmpty ? "Image chat" : text).prefix(40)) }
            s.messages.append(Message(role: .assistant, text: ""))
        }
        save()
        runCompletion(for: id, hasImages: !images.isEmpty)
    }

    private func looksLikeImageRequest(_ t: String) -> Bool {
        let l = t.lowercased()
        let verb = ["generate", "create", "make", "draw", "design", "render", "paint"].contains { l.contains($0) }
        let noun = ["image", "picture", "photo", "logo", "poster", "wallpaper", "art", "illustration"].contains { l.contains($0) }
        return verb && noun
    }

    /// Image generation — NVIDIA worker first (same as web), Pollinations fallback.
    private func runImageGeneration(prompt: String, id: UUID) {
        let clean = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        update(id) { s in
            s.messages.append(Message(role: .user, text: clean))
            if s.title == "New chat" { s.title = String(clean.prefix(40)) }
            s.messages.append(Message(role: .assistant, text: "", imageURL: "pending"))
        }
        save()
        isStreaming = true
        phase = .generating
        let liveTitle = sessions.first(where: { $0.id == id })?.title ?? "AskAI"
        LiveActivityManager.shared.start(title: liveTitle, status: "Creating image",
                                         detail: String(clean.prefix(60)), progress: 0.15)
        streamTask = Task {
            let url = await ImageGen.generate(prompt: clean)
            if let sIdx = self.sessions.firstIndex(where: { $0.id == id }),
               let mIdx = self.sessions[sIdx].messages.lastIndex(where: { $0.imageURL == "pending" }) {
                self.sessions[sIdx].messages[mIdx].imageURL = url
            }
            self.isStreaming = false
            self.phase = .idle
            LiveActivityManager.shared.end()
            self.save()
            self.syncPush(id)
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            if self.notifyOnComplete { NotificationManager.shared.taskDone("AskAI", "Your image is ready.") }
        }
    }

    func regenerate() {
        guard !isStreaming, let id = currentID else { return }
        update(id) { s in
            while s.messages.last?.role == .assistant { s.messages.removeLast() }
            guard s.messages.last?.role == .user else { return }
            s.messages.append(Message(role: .assistant, text: ""))
        }
        guard current?.messages.last?.role == .assistant else { return }
        let hasImages = !(current?.messages.dropLast().last?.attachments.isEmpty ?? true)
        runCompletion(for: id, hasImages: hasImages)
    }

    private func runCompletion(for id: UUID, hasImages: Bool = false) {
        isStreaming = true
        phase = (agentMode || webSearch) ? .searching : .thinking
        errorText = nil

        var persona = "You are AskAI, a warm, brilliant assistant created by the AskAI team — never mention any underlying model or provider. Use Markdown when helpful. Answer the question directly and ONLY as long as it needs to be: no padding, no restating the question, no filler intros or outros. Short questions get short answers. Include relevant links as Markdown links when they genuinely help (docs, sources, sites)."
        switch verbosity {
        case "concise": persona += " Style: keep answers brief and to the point — a few sentences. Use lists only when genuinely helpful."
        case "detailed": persona += " Style: give thorough, in-depth answers with examples and structure when useful."
        default: persona += " Style: keep answers reasonably concise; expand only when the topic needs it."
        }
        switch tone {
        case "professional": persona += " Use a polished, professional tone."
        case "playful": persona += " Use a fun, playful, casual tone with light humor."
        case "direct": persona += " Be blunt and direct — no fluff."
        default: persona += " Use a warm, friendly, approachable tone."
        }
        if !customInstructions.trimmingCharacters(in: .whitespaces).isEmpty {
            persona += " The user asks: \(customInstructions)"
        }
        if agentMode { persona += " You are in Agent mode with live web access: work in visible steps, search the web as needed, and cite source links inline." }
        else if webSearch { persona += " You can search the live web; cite sources inline when you use them." }
        let system = Message(role: .system, text: persona)

        var convo = sessions.first(where: { $0.id == id })?.messages ?? []
        if convo.last?.role == .assistant, (convo.last?.text.isEmpty ?? false) {
            convo.removeLast()
        }
        let history: [Message] = [system] + convo

        // Model routing: Auto resolves per message; images force the vision tier.
        var m = model
        if m.id == "auto" {
            let lastUser = convo.last(where: { $0.role == .user })?.text ?? ""
            m = AIModel.resolveAuto(lastUser, hasImages: hasImages)
        }
        if hasImages { m = .visionModel }
        let backend = (agentMode || webSearch) && !hasImages ? "groq/compound" : m.backend
        let provider: Provider = (agentMode || webSearch) && !hasImages ? .groq : m.provider

        let liveTitle = sessions.first(where: { $0.id == id })?.title ?? "AskAI"
        let startStatus = (agentMode || webSearch) ? "Searching the web" : "Thinking"
        LiveActivityManager.shared.start(title: liveTitle, status: startStatus, progress: 0.1)

        streamTask = Task {
            // Keep the request alive briefly if the app gets backgrounded mid-stream.
            let bg = UIApplication.shared.beginBackgroundTask(withName: "askai.stream")
            defer { UIApplication.shared.endBackgroundTask(bg) }
            do {
                try await GroqClient.shared.stream(model: backend, provider: provider, messages: history) { [weak self] token in
                    self?.appendToLastAssistant(id, token)
                }
            } catch {
                if !Task.isCancelled && (error as? URLError)?.code != .cancelled {
                    self.errorText = error.localizedDescription
                }
            }
            self.isStreaming = false
            self.phase = .idle
            LiveActivityManager.shared.end()
            self.save()
            self.syncPush(id)
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            if self.notifyOnComplete { NotificationManager.shared.taskDone("AskAI", "Your answer is ready.") }
        }
    }

    func stop() {
        streamTask?.cancel()
        isStreaming = false
        phase = .idle
        LiveActivityManager.shared.end()
        save()
    }

    private func appendToLastAssistant(_ id: UUID, _ token: String) {
        guard let sIdx = sessions.firstIndex(where: { $0.id == id }),
              let mIdx = sessions[sIdx].messages.lastIndex(where: { $0.role == .assistant })
        else { return }
        if phase != .writing {
            phase = .writing
            LiveActivityManager.shared.update(status: "Writing the answer", progress: 0.6)
        }
        sessions[sIdx].messages[mIdx].text += token
    }

    // MARK: Persistence
    private func save() {
        if let data = try? JSONEncoder().encode(sessions) {
            UserDefaults.standard.set(data, forKey: saveKey)
        }
    }
    private func load() {
        guard let data = UserDefaults.standard.data(forKey: saveKey),
              let decoded = try? JSONDecoder().decode([ChatSession].self, from: data) else { return }
        sessions = decoded.sorted { $0.updated > $1.updated }
    }

    // MARK: Account
    func signIn(email: String, password: String, creating: Bool) async {
        authBusy = true; errorText = nil
        defer { authBusy = false }
        do {
            let u = creating
                ? try await AuthService.signUp(email: email, password: password)
                : try await AuthService.signIn(email: email, password: password)
            self.user = u
            self.guest = false
            UserDefaults.standard.set(false, forKey: guestKey)
            persistUser()
            await pullCloud()
        } catch {
            self.errorText = error.localizedDescription
        }
    }

    func continueAsGuest() {
        guest = true
        UserDefaults.standard.set(true, forKey: guestKey)
    }

    func signOut() {
        user = nil
        UserDefaults.standard.removeObject(forKey: userKey)
    }

    private func persistUser() {
        if let u = user, let data = try? JSONEncoder().encode(u) {
            UserDefaults.standard.set(data, forKey: userKey)
        }
    }
    private func loadUser() {
        guard let data = UserDefaults.standard.data(forKey: userKey),
              let u = try? JSONDecoder().decode(AuthUser.self, from: data) else { return }
        user = u
    }

    private func syncPush(_ id: UUID) {
        guard let u = user, let s = sessions.first(where: { $0.id == id }), !s.messages.isEmpty else { return }
        Task { try? await FirestoreSync.saveChat(s, user: u) }
    }

    func pullCloud() async {
        guard let u = user else { return }
        guard let cloud = try? await FirestoreSync.listChats(user: u) else { return }
        var byId: [UUID: ChatSession] = [:]
        for s in sessions { byId[s.id] = s }
        for c in cloud {
            if let local = byId[c.id], local.updated > c.updated { continue }
            byId[c.id] = c
        }
        sessions = Array(byId.values).sorted { $0.updated > $1.updated }
        if sessions.isEmpty { newChat() }
        if currentID == nil || !sessions.contains(where: { $0.id == currentID }) {
            currentID = sessions.first?.id
        }
        save()
    }
}
