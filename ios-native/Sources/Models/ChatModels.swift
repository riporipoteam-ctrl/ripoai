import Foundation

enum Role: String, Codable { case user, assistant, system }

struct Message: Identifiable, Codable, Equatable {
    var id = UUID()
    var role: Role
    var text: String
    /// Set when this assistant turn is a generated image (loaded from a URL).
    var imageURL: String? = nil
}

struct ChatSession: Identifiable, Codable, Equatable {
    var id = UUID()
    var title: String = "New chat"
    var messages: [Message] = []
    var updated: Date = Date()
}

struct AIModel: Identifiable, Hashable {
    let id: String
    let name: String
    let groq: String

    static let all: [AIModel] = [
        AIModel(id: "4o-pro",   name: "AskAI 4o Pro",    groq: "openai/gpt-oss-120b"),
        AIModel(id: "instant",  name: "AskAI Instant",   groq: "llama-3.3-70b-versatile"),
        AIModel(id: "fast",     name: "AskAI Fast",      groq: "llama-3.1-8b-instant"),
    ]
    static let `default` = all[0]
}
