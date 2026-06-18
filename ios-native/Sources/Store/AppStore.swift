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
    private var i18nPending: Set<String> = []           // queued for background translation
    private var i18nTried: Set<String> = []             // already attempted (avoid re-querying / loops)
    private var i18nInFlight = false
    private var i18nFlushTask: Task<Void, Never>?
    @Published var agents: [CustomAgent] = []           // user-created AI agents
    @Published var teamAvatars: [String: String] = [:]  // built-in team agent id -> portrait URL

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
        loadAgents()
        loadTeamAvatars()
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

    /// The language the UI should render in right now ("en" means no translation).
    var activeLangCode: String { language == "auto" ? Languages.device().code : language }

    /// Translate ANY wrapped UI string. Returns the cached translation instantly,
    /// or the English original while a debounced background batch fetches the rest.
    /// Wrapping a brand-new string anywhere in the UI is enough — it self-registers
    /// and the whole interface translates, not just a fixed master list.
    func t(_ s: String) -> String {
        guard activeLangCode != "en", !s.isEmpty else { return s }
        if let hit = i18n[s] { return hit }
        register(s)
        return s
    }

    /// Queue a string for translation if we don't have it yet.
    private func register(_ s: String) {
        let trimmed = s.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count > 1, i18n[s] == nil, !i18nPending.contains(s), !i18nTried.contains(s) else { return }
        // Nothing to translate in pure numbers / symbols / emoji.
        if trimmed.rangeOfCharacter(from: .letters) == nil { return }
        i18nPending.insert(s)
        scheduleFlush()
    }

    private func scheduleFlush() {
        i18nFlushTask?.cancel()
        i18nFlushTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 400_000_000)   // debounce a render's worth of t() calls
            if Task.isCancelled { return }
            await self?.flushPending()
        }
    }

    /// Load cached translations for the active language and warm common strings.
    func applyTranslations() {
        i18nFlushTask?.cancel()
        i18nPending.removeAll()
        i18nTried.removeAll()
        let target = activeLangCode
        guard target != "en" else { i18n = [:]; return }
        if let data = UserDefaults.standard.data(forKey: "askai.i18n.\(target)"),
           let cached = try? JSONDecoder().decode([String: String].self, from: data) {
            i18n = cached
        } else {
            i18n = [:]
        }
        for s in UIStrings.all { register(s) }   // pre-translate the most common labels
    }

    private func flushPending() async {
        guard !i18nInFlight else { return }
        let target = activeLangCode
        guard target != "en", let lang = Languages.all.first(where: { $0.code == target }) else {
            i18nPending.removeAll(); return
        }
        let items = Array(i18nPending.filter { i18n[$0] == nil }.prefix(60))
        guard !items.isEmpty else { return }
        i18nInFlight = true
        defer { i18nInFlight = false }

        let numbered = items.enumerated().map { "\($0.offset). \($0.element)" }.joined(separator: "\n")
        let sys = "You are a professional app localizer. Translate each numbered UI label into \(lang.name) (\(lang.native)). Return ONLY a JSON array of strings in the same order — translate item i to array position i, same number of items. Keep them short and natural for a mobile app interface. Preserve trailing punctuation like '…', placeholders and symbols. No comments, no notes."
        if let out = try? await GroqClient.shared.complete(
            model: "llama-3.3-70b-versatile",
            messages: [Message(role: .system, text: sys), Message(role: .user, text: numbered)]),
           let start = out.firstIndex(of: "["), let end = out.lastIndex(of: "]"),
           let data = String(out[start...end]).data(using: .utf8),
           let arr = try? JSONSerialization.jsonObject(with: data) as? [String] {
            var changed = false
            for (i, original) in items.enumerated() where i < arr.count {
                let tr = arr[i].trimmingCharacters(in: .whitespacesAndNewlines)
                if !tr.isEmpty { i18n[original] = tr; changed = true }
            }
            if changed { persistI18n(target) }
        }
        for original in items { i18nPending.remove(original) }
        i18nTried.formUnion(items)                     // don't re-query this language session
        if !i18nPending.isEmpty { scheduleFlush() }   // keep draining the queue
    }

    private func persistI18n(_ code: String) {
        if let enc = try? JSONEncoder().encode(i18n) {
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

    /// Broader trigger for grounding answers (incl. image questions): identify,
    /// fix/repair, parts, prices, how-to, troubleshooting, etc.
    func wantsResearch(_ t: String) -> Bool {
        if needsFreshInfo(t) { return true }
        let l = t.lowercased()
        let kws = ["fix", "repair", "replace", "broken", "error", "how to", "how do i",
                   "what is", "what's this", "whats this", "identify", "diagnose", "model",
                   "part", "serial", "cost", "worth", "manual", "instructions", "troubleshoot",
                   "not working", "won't", "wont", "should i", "compatible", "specs", "review"]
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
        // Create an agent right from the main chat: "make an agent named Leon…"
        if images.isEmpty && !agentMode && looksLikeAgentRequest(text) {
            runAgentCreation(text, id: id)
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

    /// Build an agent from a chat message and confirm it inline in the chat.
    private func runAgentCreation(_ text: String, id: UUID) {
        update(id) { s in
            s.messages.append(Message(role: .user, text: text))
            if s.title == "New chat" { s.title = "New agent" }
            s.messages.append(Message(role: .assistant, text: "Designing your agent…"))
        }
        isStreaming = true
        save()
        streamTask = Task {
            let a = await createAgent(from: text)
            let msg: String
            if let a {
                let skills = a.skills.isEmpty ? "" : " They're great at \(a.skills.prefix(3).joined(separator: ", "))."
                msg = "✅ Meet **\(a.name)** — your \(a.role).\(skills) I gave them a profile picture and their own room. Open **Agents** to chat with \(a.name) or assign tasks."
            } else {
                msg = "I couldn't create that agent just now — try rephrasing, e.g. \"make an agent named Leon that researches things for me.\""
            }
            self.setLastAssistant(id, msg)
            self.isStreaming = false
            self.save()
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        }
    }

    /// Agent mode → run the OpenClaw browser agent live and write its findings.
    private func runAgentTask(_ task: String, id: UUID) {
        let a = OpenClawAgent()
        agent = a
        // Don't auto-present the full browser sheet — like Nebula's "view
        // activity", the live viewport only opens when the user taps the task
        // pill. Keeps the chat clean while OpenClaw works in the background.
        showAgentPanel = false
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
        // Real search: web/agent mode, auto-detected fresh-info queries, OR an
        // image the user is asking to identify/fix (the repair-shop case).
        let doSearch = !lastUserText.isEmpty &&
            ((agentMode || webSearch || autoSearch) ||
             (hasImages && (webSearch || (autoWebSearch && wantsResearch(lastUserText)))))
        // Answer with a normal/vision model grounded on real results (reliable),
        // not a server-side tool that may silently do nothing.
        let answerModel = hasImages ? AIModel.visionModel.backend : m.backend
        let answerProvider: Provider = hasImages ? AIModel.visionModel.provider : m.provider
        if doSearch { phase = .searching }

        let liveTitle = sessions.first(where: { $0.id == id })?.title ?? "AskAI"
        LiveActivityManager.shared.start(title: liveTitle, status: doSearch ? "Searching the web" : "Thinking", progress: 0.1)

        streamTask = Task {
            // Keep the request alive briefly if the app gets backgrounded mid-stream.
            let bg = UIApplication.shared.beginBackgroundTask(withName: "askai.stream")
            defer { UIApplication.shared.endBackgroundTask(bg) }

            // 1) Actually search the web and ground the answer on the results.
            var grounded = history
            var sources: [(title: String, url: String)] = []
            if doSearch, let result = await WebSearch.run(lastUserText) {
                sources = result.sources
                let ctx = Message(role: .system, text: result.context +
                    "\n\nAnswer the user's question using these live results. Be specific and practical (names, numbers, steps, parts, prices). Cite sources inline as Markdown links. If the results don't cover it, say what you do know and what to check next.")
                grounded = [system, ctx] + convo
                self.phase = .writing
                LiveActivityManager.shared.update(status: "Writing the answer", progress: 0.6)
            } else if doSearch {
                self.phase = .thinking   // search came back empty — answer from knowledge
            }

            // 2) Stream the grounded answer.
            do {
                try await GroqClient.shared.stream(model: answerModel, provider: answerProvider, messages: grounded) { [weak self] token in
                    self?.appendToLastAssistant(id, token)
                }
            } catch {
                if !Task.isCancelled && (error as? URLError)?.code != .cancelled {
                    self.errorText = error.localizedDescription
                }
            }
            // 3) Append a Sources list when we used the web.
            if !sources.isEmpty, !self.lastAssistantIsEmpty(id) {
                let block = "\n\n**Sources**\n" + sources.prefix(5).map { "- [\($0.title)](\($0.url))" }.joined(separator: "\n")
                self.appendToLastAssistant(id, block)
            }
            if self.lastAssistantIsEmpty(id) {
                self.setLastAssistant(id, "I couldn't pull that together just now — try asking again.")
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

    @Published var projectBuilding = false

    /// Chat with AskAI to build/edit a project. Streams a coding answer, parses
    /// fenced ```lang /path blocks into real files, and auto-continues if the
    /// model hits the length limit (so long builds never stop half-done).
    func buildInProject(_ id: UUID, prompt: String) {
        guard let pIdx = projects.firstIndex(where: { $0.id == id }), !projectBuilding else { return }
        projectBuilding = true
        projects[pIdx].chat.append(Message(role: .user, text: prompt))
        projects[pIdx].chat.append(Message(role: .assistant, text: ""))
        saveProjects()
        let aIdx = projects[pIdx].chat.count - 1

        let sys = Message(role: .system, text: """
        You are AskAI Projects — a world-class web developer building a multi-file static website (plain HTML/CSS/JS, no build step). Output EACH file as its own fenced block whose info string is the file path, e.g.:
        ```html /index.html
        <!doctype html> … </html>
        ```
        ```css /styles.css
        …
        ```
        Prefer separate files (/index.html + /styles.css + /script.js). Make it modern, polished, fully responsive, with real content and tasteful motion. Only output the files you are changing. Never write placeholders like "rest of code" — finish every file completely and runnably.
        """)
        let filesNote = projects[pIdx].files.isEmpty ? "" :
            "Current files:\n" + projects[pIdx].files.keys.sorted().map { "- \($0)" }.joined(separator: "\n")
        var history: [Message] = [sys]
        if !filesNote.isEmpty { history.append(Message(role: .system, text: filesNote)) }
        history += projects[pIdx].chat.dropLast()  // includes the new user msg

        streamTask = Task {
            let bg = UIApplication.shared.beginBackgroundTask(withName: "askai.build")
            defer { UIApplication.shared.endBackgroundTask(bg) }
            var full = ""
            var rounds = 0
            var convo = history
            repeat {
                var chunk = ""
                do {
                    try await GroqClient.shared.stream(model: "llama-3.3-70b-versatile", messages: convo) { [weak self] tok in
                        chunk += tok; full += tok
                        if let self, pIdx < self.projects.count, aIdx < self.projects[pIdx].chat.count {
                            self.projects[pIdx].chat[aIdx].text = full
                        }
                    }
                } catch { break }
                rounds += 1
                // Auto-continue if it looks cut off mid-file (unbalanced fences).
                let openFences = full.components(separatedBy: "```").count - 1
                let looksCut = openFences % 2 == 1 || chunk.count > 3500
                if looksCut && rounds < 4 {
                    convo = history + [Message(role: .assistant, text: full),
                                       Message(role: .user, text: "Continue exactly where you left off. Do not repeat earlier content.")]
                } else { break }
            } while rounds < 4

            // Parse fenced files into the project.
            let parsed = Self.parseFiles(full)
            if pIdx < self.projects.count {
                for (path, code) in parsed { self.projects[pIdx].files[path] = code }
                self.projects[pIdx].updated = Date()
            }
            self.projectBuilding = false
            self.saveProjects()
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        }
    }

    /// Parse ```lang /path\n…``` blocks into [path: code].
    static func parseFiles(_ text: String) -> [String: String] {
        var out: [String: String] = [:]
        let pattern = #"```[a-zA-Z0-9]*\s+(/?[^\s`]+)\n([\s\S]*?)```"#
        guard let re = try? NSRegularExpression(pattern: pattern) else { return out }
        let ns = text as NSString
        re.enumerateMatches(in: text, range: NSRange(location: 0, length: ns.length)) { m, _, _ in
            guard let m, m.numberOfRanges >= 3 else { return }
            var path = ns.substring(with: m.range(at: 1))
            if !path.hasPrefix("/") { path = "/" + path }
            // Normalise to keys like "index.html" used by the file list.
            let key = String(path.drop(while: { $0 == "/" }))
            out[key] = ns.substring(with: m.range(at: 2))
        }
        return out
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

    // MARK: Custom AI agents
    private let agentsKey = "askai.agents.v2"
    @Published var creatingAgent = false
    @Published var agentCreationStatus = ""

    func saveAgents() {
        if let data = try? JSONEncoder().encode(agents) { UserDefaults.standard.set(data, forKey: agentsKey) }
    }

    // MARK: Built-in team agent portraits (real generated avatars, not emoji)
    private let teamAvatarsKey = "askai.teamavatars.v1"
    private var teamAvatarBusy = false

    func ensureTeamAvatars() {
        let missing = TeamAgent.all.filter { teamAvatars[$0.id] == nil }
        guard !missing.isEmpty, !teamAvatarBusy else { return }
        teamAvatarBusy = true
        Task {
            for a in missing {
                let url = await ImageGen.generate(prompt: "\(a.portraitPrompt). Friendly, warm, realistic avatar portrait, head-and-shoulders, soft studio lighting, centered, clean background.")
                if !url.isEmpty { self.teamAvatars[a.id] = url; self.saveTeamAvatars() }
            }
            self.teamAvatarBusy = false
        }
    }
    func saveTeamAvatars() {
        if let d = try? JSONEncoder().encode(teamAvatars) { UserDefaults.standard.set(d, forKey: teamAvatarsKey) }
    }
    private func loadTeamAvatars() {
        if let d = UserDefaults.standard.data(forKey: teamAvatarsKey),
           let m = try? JSONDecoder().decode([String: String].self, from: d) { teamAvatars = m }
    }
    private func loadAgents() {
        guard let data = UserDefaults.standard.data(forKey: agentsKey),
              let decoded = try? JSONDecoder().decode([CustomAgent].self, from: data) else { return }
        agents = decoded
    }

    /// True if the message reads like a request to create/hire a new agent.
    func looksLikeAgentRequest(_ t: String) -> Bool {
        let l = t.lowercased()
        let verb = ["create", "make", "hire", "build", "add", "spin up", "give me"].contains { l.contains($0) }
        return verb && l.contains("agent")
    }

    /// Head agent (AskAI 4o Pro) designs a new agent from the request, then
    /// generates its profile picture. Drives a live creation status.
    func createAgent(from request: String) async -> CustomAgent? {
        creatingAgent = true
        agentCreationStatus = "Designing your agent…"
        defer { creatingAgent = false }

        let sys = Message(role: .system, text: """
        You are AskAI, the head of an AI agent team. The user wants a new agent. Design it. Reply with ONLY compact JSON, no prose:
        {"name":"<a short first name; use the one the user gave, else invent a fitting one>","role":"<2-4 word role>","persona":"<2-3 sentence personality + how it works>","skills":["skill1","skill2","skill3"],"avatar":"<a vivid 1-line image prompt for a friendly, realistic avatar portrait — e.g. 'a friendly golden retriever wearing glasses, studio portrait' or 'a warm smiling young engineer, soft studio light'>"}
        """)
        guard let out = try? await GroqClient.shared.complete(
            model: "llama-3.3-70b-versatile",
            messages: [sys, Message(role: .user, text: request)]),
              let start = out.firstIndex(of: "{"), let end = out.lastIndex(of: "}"),
              let data = String(out[start...end]).data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { agentCreationStatus = ""; return nil }

        let name = (obj["name"] as? String)?.trimmingCharacters(in: .whitespaces) ?? "Nova"
        let role = (obj["role"] as? String) ?? "Specialist"
        let persona = (obj["persona"] as? String) ?? "A capable, friendly AI specialist."
        let skills = (obj["skills"] as? [String]) ?? []
        let avatarPrompt = (obj["avatar"] as? String) ?? "a friendly robot avatar, studio portrait, soft lighting"

        agentCreationStatus = "Painting \(name)'s portrait…"
        let avatar = await ImageGen.generate(prompt: "\(avatarPrompt). High-quality avatar portrait, centered, clean background.")

        var agent = CustomAgent(name: name, role: role, persona: persona, skills: skills, avatar: avatar)
        agent.chat = [Message(role: .assistant, text: "Hi, I'm **\(name)** — your \(role). \(skills.isEmpty ? "" : "I can help with \(skills.prefix(3).joined(separator: ", ")). ")Give me a task and I'll get to work.")]
        agents.insert(agent, at: 0)
        saveAgents()
        agentCreationStatus = ""
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        return agent
    }

    func updateAgent(_ a: CustomAgent) {
        guard let i = agents.firstIndex(where: { $0.id == a.id }) else { return }
        agents[i] = a; saveAgents()
    }
    func deleteAgent(_ id: UUID) { agents.removeAll { $0.id == id }; saveAgents() }

    @Published var agentReplying = false
    @Published var agentBrowser: OpenClawAgent?   // live OpenClaw run inside an agent room

    /// Send a message to one agent's room. The agent answers in character and,
    /// when the task needs current info (or the user forces it), actually browses
    /// the live web with its own OpenClaw browser and grounds the answer on what
    /// it read — with a live browser trace shown in the room.
    func messageAgent(_ id: UUID, text: String, forceBrowse: Bool = false) {
        guard let idx = agents.firstIndex(where: { $0.id == id }), !agentReplying else { return }
        agentReplying = true
        agents[idx].chat.append(Message(role: .user, text: text))
        agents[idx].chat.append(Message(role: .assistant, text: ""))
        saveAgents()
        let aIdx = agents[idx].chat.count - 1
        let agent = agents[idx]
        let browse = agent.canBrowse && (forceBrowse || wantsResearch(text))

        var langNote = ""
        if let lang = Languages.instructionName(language) { langNote = " Always respond in \(lang)." }
        let sys = Message(role: .system, text:
            "You are \(agent.name), a \(agent.role) on the user's AI team. \(agent.persona) Skills: \(agent.skills.joined(separator: ", ")). You have a real OpenClaw web browser. Speak in first person, be concise and genuinely useful, use Markdown when helpful.\(langNote)")
        var history = [sys] + agent.chat.dropLast()

        streamTask = Task {
            let bg = UIApplication.shared.beginBackgroundTask(withName: "askai.agent.msg")
            defer { UIApplication.shared.endBackgroundTask(bg) }
            var sources: [(title: String, url: String)] = []

            // Real OpenClaw browse — live trace in the room, then ground the reply.
            if browse {
                let oc = OpenClawAgent()
                self.agentBrowser = oc
                let findings = await oc.run(text)
                sources = oc.sources
                self.agentBrowser = nil
                if !findings.trimmingCharacters(in: .whitespaces).isEmpty {
                    history.insert(Message(role: .system, text:
                        "You just used your OpenClaw browser to research this. What you found:\n\(findings)\n\nNow answer in character using these concrete facts, and cite the source links inline as Markdown."), at: 1)
                }
            }

            do {
                try await GroqClient.shared.stream(model: "llama-3.3-70b-versatile", messages: history) { [weak self] tok in
                    guard let self, let i = self.agents.firstIndex(where: { $0.id == id }), aIdx < self.agents[i].chat.count else { return }
                    self.agents[i].chat[aIdx].text += tok
                }
            } catch {}
            if !sources.isEmpty, let i = self.agents.firstIndex(where: { $0.id == id }), aIdx < self.agents[i].chat.count {
                self.agents[i].chat[aIdx].text += "\n\n**Sources**\n" + sources.prefix(5).map { "- [\($0.title)](\($0.url))" }.joined(separator: "\n")
            }
            if let i = self.agents.firstIndex(where: { $0.id == id }), aIdx < self.agents[i].chat.count,
               self.agents[i].chat[aIdx].text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                self.agents[i].chat[aIdx].text = "I couldn't pull that together just now — try asking again."
            }
            self.agentReplying = false
            self.agentBrowser = nil
            self.saveAgents()
        }
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
