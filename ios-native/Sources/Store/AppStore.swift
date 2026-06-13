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
    @Published var agent: OpenClawAgent?               // live OpenClaw run
    @Published var showAgentPanel = false              // present the live browser panel
    @Published var requestVoiceCall = false            // present voice-call full screen
    @Published var requestLiveCamera = false           // present live camera vision full screen
    @Published var requestScreenVision = false         // present screen-share vision full screen
    @Published var appearance = "system"               // system | light | dark
    @Published var notifyOnComplete = false
    @Published var aiCheckins = "off"                   // off | daily | weekly | monthly
    @Published var locationEnabled = false
    @Published var verbosity = "balanced"               // concise | balanced | detailed
    @Published var tone = "friendly"                    // professional | friendly | playful | direct
    @Published var customInstructions = ""
    @Published var language = "auto"                    // "auto" or ISO code
    @Published var autoWebSearch = true                 // auto-search when a query needs fresh info
    @Published var projects: [Project] = []             // local projects (everyone)
    @Published var teamLog: [TeamLogEntry] = []         // persisted Agents room
    @Published var i18n: [String: String] = [:]         // English UI string -> translated

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
    private let langKey = "askai.language"
    private let autoSearchKey = "askai.autosearch"
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
        language = UserDefaults.standard.string(forKey: langKey) ?? "auto"
        autoWebSearch = UserDefaults.standard.object(forKey: autoSearchKey) as? Bool ?? true
        loadProjects()
        loadTeamLog()
        applyTranslations()
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

    func setLanguage(_ v: String) {
        language = v
        UserDefaults.standard.set(v, forKey: langKey)
        applyTranslations()
    }

    /// Translate the whole UI: look a string up in the translation table.
    func t(_ s: String) -> String { i18n[s] ?? s }

    /// Load cached translations for the active language and refresh in background.
    func applyTranslations() {
        let target = language == "auto" ? Languages.device().code : language
        guard target != "en" else { i18n = [:]; return }
        if let data = UserDefaults.standard.data(forKey: "askai.i18n.\(target)"),
           let cached = try? JSONDecoder().decode([String: String].self, from: data) {
            i18n = cached
        } else {
            i18n = [:]
        }
        Task { await fetchTranslations(target) }
    }

    private func fetchTranslations(_ code: String) async {
        guard let lang = Languages.all.first(where: { $0.code == code }) else { return }
        let list = UIStrings.all
        if i18n.count >= list.count { return }   // already have a full set cached
        let numbered = list.enumerated().map { "\($0.offset). \($0.element)" }.joined(separator: "\n")
        let sys = "You are a professional app localizer. Translate each numbered UI label into \(lang.name) (\(lang.native)). Return ONLY a JSON array of strings — same order, exactly \(list.count) items, no comments. Keep translations short and natural for a mobile app. Preserve punctuation like '…' and symbols."
        guard let out = try? await GroqClient.shared.complete(
            model: "llama-3.3-70b-versatile",
            messages: [Message(role: .system, text: sys), Message(role: .user, text: numbered)]),
            let start = out.firstIndex(of: "["), let end = out.lastIndex(of: "]"),
            let data = String(out[start...end]).data(using: .utf8),
            let arr = try? JSONSerialization.jsonObject(with: data) as? [String],
            arr.count == list.count else { return }
        var d: [String: String] = [:]
        for (i, s) in list.enumerated() where !arr[i].isEmpty { d[s] = arr[i] }
        i18n = d
        if let enc = try? JSONEncoder().encode(d) {
            UserDefaults.standard.set(enc, forKey: "askai.i18n.\(code)")
        }
    }

    func setAutoWebSearch(_ v: Bool) {
        autoWebSearch = v
        UserDefaults.standard.set(v, forKey: autoSearchKey)
    }

    /// True when a question likely needs current/real-time info → auto web search.
    func needsFreshInfo(_ t: String) -> Bool {
        let l = t.lowercased()
        let kws = ["latest", "today", "tonight", "current", "currently", "right now",
                   "this week", "this month", "this year", "2024", "2025", "2026",
                   "news", "weather", "price", "stock", "score", "who won", "release date",
                   "schedule", "when is", "when does", "how much is", "near me", "open now",
                   "trending", "live", "update", "recent", "yesterday", "tomorrow"]
        return kws.contains { l.contains($0) }
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
        if agentMode {
            runAgentTask(text, id: id)
        } else {
            runCompletion(for: id, hasImages: !images.isEmpty)
        }
    }

    /// Agent mode → run the OpenClaw browser agent live and write its findings.
    private func runAgentTask(_ task: String, id: UUID) {
        let a = OpenClawAgent()
        agent = a
        showAgentPanel = true
        isStreaming = true
        phase = .searching
        let liveTitle = sessions.first(where: { $0.id == id })?.title ?? "AskAI"
        LiveActivityManager.shared.start(title: liveTitle, status: "OpenClaw is browsing", progress: 0.15)
        streamTask = Task {
            let bg = UIApplication.shared.beginBackgroundTask(withName: "askai.agent")
            defer { UIApplication.shared.endBackgroundTask(bg) }
            let answer = await a.run(task)
            var text = answer.trimmingCharacters(in: .whitespacesAndNewlines)
            if !a.sources.isEmpty {
                text += "\n\n**Sources**\n" + a.sources.prefix(8).map { "- [\($0.title)](\($0.url))" }.joined(separator: "\n")
            }
            if text.isEmpty { text = "I browsed the web but couldn’t pull that together — try rephrasing the task." }
            self.setLastAssistant(id, text)
            self.isStreaming = false
            self.phase = .idle
            LiveActivityManager.shared.end()
            self.save()
            self.syncPush(id)
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            if self.notifyOnComplete { NotificationManager.shared.taskDone("AskAI", "OpenClaw finished your task.") }
        }
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

        var persona = "You are AskAI, a warm, brilliant assistant created by the AskAI team — never mention any underlying model or provider. Use Markdown when helpful (headings, lists, fenced code blocks with language tags, and LaTeX $…$ for math). Answer the question directly and ONLY as long as it needs to be: no padding, no restating the question, no filler intros or outros. Short questions get short answers. Include relevant links as Markdown links when they genuinely help (docs, sources, sites). For hard problems — math, code, multi-step reasoning — think carefully and verify before answering, and when you write code make it complete and runnable (no placeholders or 'rest of code' comments). Accuracy over confidence: never fabricate facts, numbers, citations, APIs or URLs; if you're unsure or it may have changed, say so plainly."
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
        // Language: force the chosen language, or mirror the user's language on Auto.
        if let lang = Languages.instructionName(language) {
            persona += " ALWAYS write your entire reply in \(lang), regardless of the language of the question, unless the user explicitly asks for another language."
        } else {
            persona += " Reply in the same language the user is writing in."
        }
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
        let lastUserText = convo.last(where: { $0.role == .user })?.text ?? ""
        let autoSearch = autoWebSearch && needsFreshInfo(lastUserText)
        let useCompound = (agentMode || webSearch || autoSearch) && !hasImages
        if autoSearch && !webSearch && !agentMode { phase = .searching }
        let backend = useCompound ? "groq/compound" : m.backend
        let provider: Provider = useCompound ? .groq : m.provider
        let fallbackModel = m.provider == .groq ? m.backend : "llama-3.3-70b-versatile"

        let liveTitle = sessions.first(where: { $0.id == id })?.title ?? "AskAI"
        let startStatus = useCompound ? "Searching the web" : "Thinking"
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
            // Web/agent reliability: if the search tool ran but streamed no answer,
            // fall back to a normal model so the user never gets a dead bubble.
            if useCompound, !Task.isCancelled, self.lastAssistantIsEmpty(id) {
                self.phase = .thinking
                LiveActivityManager.shared.update(status: "Writing the answer", progress: 0.5)
                do {
                    try await GroqClient.shared.stream(model: fallbackModel, provider: .groq, messages: history) { [weak self] token in
                        self?.appendToLastAssistant(id, token)
                    }
                } catch {
                    if self.lastAssistantIsEmpty(id) {
                        self.setLastAssistant(id, "I searched but couldn't pull that together just now — try asking again.")
                    }
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

    private func lastAssistantIsEmpty(_ id: UUID) -> Bool {
        guard let s = sessions.first(where: { $0.id == id }),
              let last = s.messages.last(where: { $0.role == .assistant }) else { return false }
        return last.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func setLastAssistant(_ id: UUID, _ text: String) {
        guard let sIdx = sessions.firstIndex(where: { $0.id == id }),
              let mIdx = sessions[sIdx].messages.lastIndex(where: { $0.role == .assistant }) else { return }
        sessions[sIdx].messages[mIdx].text = text
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

    // MARK: Projects (local, work for everyone)
    private let projectsKey = "askai.projects.v1"

    @discardableResult
    func createProject(name: String) -> Project {
        let clean = name.trimmingCharacters(in: .whitespaces)
        let title = clean.isEmpty ? "Untitled project" : clean
        let starter = "<!doctype html>\n<html>\n<head>\n  <meta charset=\"utf-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n  <title>\(title)</title>\n</head>\n<body>\n  <h1>\(title)</h1>\n  <p>Built with AskAI.</p>\n</body>\n</html>"
        let p = Project(name: title, files: ["index.html": starter])
        projects.insert(p, at: 0)
        saveProjects()
        return p
    }

    func deleteProject(_ id: UUID) {
        projects.removeAll { $0.id == id }
        saveProjects()
    }

    func updateProjectFile(_ id: UUID, path: String, content: String) {
        guard let i = projects.firstIndex(where: { $0.id == id }) else { return }
        projects[i].files[path] = content
        projects[i].updated = Date()
        saveProjects()
    }

    func saveProjects() {
        if let data = try? JSONEncoder().encode(projects) {
            UserDefaults.standard.set(data, forKey: projectsKey)
        }
    }
    private func loadProjects() {
        guard let data = UserDefaults.standard.data(forKey: projectsKey),
              let decoded = try? JSONDecoder().decode([Project].self, from: data) else { return }
        projects = decoded.sorted { $0.updated > $1.updated }
    }

    // MARK: Agents (team) room — persisted
    private let teamKey = "askai.team.v1"
    func saveTeamLog() {
        if let data = try? JSONEncoder().encode(teamLog) {
            UserDefaults.standard.set(data, forKey: teamKey)
        }
    }
    private func loadTeamLog() {
        guard let data = UserDefaults.standard.data(forKey: teamKey),
              let decoded = try? JSONDecoder().decode([TeamLogEntry].self, from: data) else { return }
        teamLog = decoded
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
