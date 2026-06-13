import Foundation

/// A locally-stored project (works for everyone, signed in or not).
struct Project: Identifiable, Codable, Equatable {
    var id = UUID()
    var name: String
    var files: [String: String] = [:]
    var created = Date()
    var updated = Date()
    /// The build conversation with AskAI for this project.
    var chat: [Message] = []
}

/// A persisted entry from the Agents (team) room so conversations survive.
struct TeamLogEntry: Identifiable, Codable, Equatable {
    var id = UUID()
    var agentId: String?      // nil for the user's own message
    var text: String
    var fromUser: Bool
}

/// A user-created AI agent with its own persona, skills, avatar and chat room.
struct CustomAgent: Identifiable, Codable, Equatable {
    var id = UUID()
    var name: String
    var role: String
    var persona: String
    var skills: [String] = []
    var avatar: String? = nil      // generated image URL / data URL
    var canBrowse: Bool = true
    var chat: [Message] = []
    var created = Date()
}
