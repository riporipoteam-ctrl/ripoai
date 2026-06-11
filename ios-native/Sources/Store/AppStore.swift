import SwiftUI

@MainActor
final class AppStore: ObservableObject {
    @Published var sessions: [ChatSession] = []
    @Published var currentID: UUID?
    @Published var model: AIModel = .default
    @Published var webSearch = false
    @Published var isStreaming = false
    @Published var errorText: String?

    private let saveKey = "askai.sessions.v1"
    private var streamTask: Task<Void, Never>?

    init() {
        load()
        if sessions.isEmpty { newChat() }
        currentID = sessions.first?.id
    }

    var current: ChatSession? {
        guard let id = currentID else { return nil }
        return sessions.first(where: { $0.id == id })
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
        guard !text.isEmpty, !isStreaming, let id = currentID else { return }
        update(id) { s in
            s.messages.append(Message(role: .user, text: text))
            if s.title == "New chat" { s.title = String(text.prefix(40)) }
            s.messages.append(Message(role: .assistant, text: ""))
        }
        save()
        runCompletion(for: id)
    }

    /// Re-answer the last user turn (drops trailing assistant messages).
    func regenerate() {
        guard !isStreaming, let id = currentID else { return }
        update(id) { s in
            while s.messages.last?.role == .assistant { s.messages.removeLast() }
            guard s.messages.last?.role == .user else { return }
            s.messages.append(Message(role: .assistant, text: ""))
        }
        guard current?.messages.last?.role == .assistant else { return }
        runCompletion(for: id)
    }

    private func runCompletion(for id: UUID) {
        isStreaming = true
        errorText = nil

        let system = Message(role: .system, text:
            "You are AskAI, a warm, brilliant assistant. Answer clearly and concisely using Markdown when helpful." +
            (webSearch ? " You can search the live web; cite sources inline when you use them." : ""))
        var convo = sessions.first(where: { $0.id == id })?.messages ?? []
        if convo.last?.role == .assistant, (convo.last?.text.isEmpty ?? false) {
            convo.removeLast()
        }
        let history: [Message] = [system] + convo
        let groqModel = webSearch ? "groq/compound" : model.groq

        streamTask = Task {
            do {
                try await GroqClient.shared.stream(model: groqModel, messages: history) { [weak self] token in
                    self?.appendToLastAssistant(id, token)
                }
            } catch {
                // Ignore cancellations (user pressed Stop); surface real errors.
                if !Task.isCancelled && (error as? URLError)?.code != .cancelled {
                    self.errorText = error.localizedDescription
                }
            }
            self.isStreaming = false
            self.save()
        }
    }

    func stop() {
        streamTask?.cancel()
        isStreaming = false
        save()
    }

    private func appendToLastAssistant(_ id: UUID, _ token: String) {
        guard let sIdx = sessions.firstIndex(where: { $0.id == id }),
              let mIdx = sessions[sIdx].messages.lastIndex(where: { $0.role == .assistant })
        else { return }
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
}
