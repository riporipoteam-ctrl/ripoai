import Foundation

enum Role: String, Codable { case user, assistant, system }

struct Message: Identifiable, Codable, Equatable {
    var id = UUID()
    var role: Role
    var text: String
    /// Generated image result (URL or data URL).
    var imageURL: String? = nil
    /// Attached images (base64 data URLs) for vision input.
    var attachments: [String] = []
}

struct ChatSession: Identifiable, Codable, Equatable {
    var id = UUID()
    var title: String = "New chat"
    var messages: [Message] = []
    var updated: Date = Date()
}

enum Provider { case groq, nvidia }

struct AIModel: Identifiable, Hashable {
    let id: String
    let name: String
    let tagline: String
    let backend: String
    let provider: Provider
    var vision = false
    var badge: String? = nil

    /// Mirrors the web app's model registry (lib/models.ts). NVIDIA tiers go
    /// through the same ripoai-nvidia worker the website uses.
    static let all: [AIModel] = [
        AIModel(id: "1o-instant", name: "AskAI 1o instant", tagline: "Fast everyday answers",
                backend: "qwen/qwen3-32b", provider: .groq),
        AIModel(id: "2o-instant", name: "AskAI 2o instant", tagline: "Quick + understands images",
                backend: "meta-llama/llama-4-scout-17b-16e-instruct", provider: .groq, vision: true),
        AIModel(id: "1o-pro", name: "AskAI 1o Pro", tagline: "Deeper reasoning + writing",
                backend: "llama-3.3-70b-versatile", provider: .groq, badge: "PRO"),
        AIModel(id: "2o-pro", name: "AskAI 2o Pro", tagline: "Flagship — best designs, code & reasoning",
                backend: "openai/gpt-oss-120b", provider: .groq, badge: "PRO"),
        AIModel(id: "3o-instant", name: "AskAI 3o instant", tagline: "Lightning-fast and very capable",
                backend: "llama-3.3-70b-versatile", provider: .groq, badge: "NEW"),
        AIModel(id: "3o-pro", name: "AskAI 3o Pro", tagline: "Our most powerful — best for building",
                backend: "openai/gpt-oss-120b", provider: .groq, badge: "MAX"),
        AIModel(id: "4o-instant", name: "AskAI 4o instant", tagline: "New — fast and very capable",
                backend: "meta/llama-4-maverick-17b-128e-instruct", provider: .nvidia, badge: "NEW"),
        AIModel(id: "4o-pro", name: "AskAI 4o Pro", tagline: "Our most advanced — deepest reasoning",
                backend: "moonshotai/kimi-k2.6", provider: .nvidia, badge: "MAX"),
    ]
    var menuLabel: String { badge == nil ? name : "\(name) · \(badge!)" }

    /// "Auto" — AskAI picks the best tier per message (resolved at send time).
    static let auto = AIModel(id: "auto", name: "Auto", tagline: "AskAI picks the best model for each task",
                              backend: "openai/gpt-oss-120b", provider: .groq)
    /// Auto + the real tiers, for pickers.
    static let selectable: [AIModel] = [auto] + all

    static let `default` = all.first { $0.id == "4o-pro" }!
    static let visionModel = all.first { $0.id == "2o-instant" }!

    static func byID(_ id: String) -> AIModel? { selectable.first { $0.id == id } }

    /// Mirrors the web app's Auto router (lib/models.ts resolveAutoModel).
    static func resolveAuto(_ text: String, hasImages: Bool) -> AIModel {
        if hasImages { return visionModel }
        let t = text.lowercased()
        func has(_ words: [String]) -> Bool { words.contains { t.contains($0) } }
        if has(["website", "web app", "landing", "3d", "game", "shader", "three.js", "webgl"]) {
            return all.first { $0.id == "4o-pro" }!
        }
        if has(["code", "coding", "function", "debug", "script", "api", "sql", "regex",
                "python", "swift", "javascript", "typescript", "rust", "java", "c++",
                "algorithm", "refactor", "stack trace", "compile"]) {
            return all.first { $0.id == "2o-pro" }!
        }
        if has(["math", "equation", "integral", "derivative", "calculus", "theorem",
                "probability", "matrix", "geometry", "proof"]) {
            return all.first { $0.id == "4o-pro" }!
        }
        if has(["essay", "write", "story", "poem", "novel", "screenplay", "blog", "article", "letter"]) {
            return all.first { $0.id == "2o-pro" }!
        }
        if t.count > 260 || has(["explain", "why", "prove", "solve", "analy", "compare",
                                 "strateg", "architect", "step by step", "in depth", "trade-off", "pros and cons"]) {
            return all.first { $0.id == "4o-pro" }!
        }
        if t.count < 24 { return all.first { $0.id == "3o-instant" }! }
        return all.first { $0.id == "4o-instant" }!
    }
}
