import Foundation

/// Streams chat completions (SSE). Routes to Groq directly or to the same
/// ripoai-nvidia worker the website uses (key held server-side there).
struct GroqClient {
    static let shared = GroqClient()
    private let groqURL = URL(string: "https://api.groq.com/openai/v1/chat/completions")!
    private let nvidiaURL = URL(string: "https://ripoai-nvidia.ripo-ripoteam.workers.dev")!

    enum GroqError: LocalizedError {
        case noKey
        case http(Int)
        var errorDescription: String? {
            switch self {
            case .noKey: return "AskAI isn’t configured with an API key in this build."
            case .http(let code): return "The model service returned an error (\(code))."
            }
        }
    }

    /// Public entry: try the requested provider, and on ANY failure fall back to
    /// the NVIDIA worker (which holds a key server-side), so agents + chat keep
    /// working even if the baked-in Groq key is missing/expired or a Groq model
    /// was deprecated.
    func stream(model: String,
                provider: Provider = .groq,
                messages: [Message],
                onToken: @escaping (String) -> Void) async throws {
        do {
            try await attempt(model: model, provider: provider, messages: messages, onToken: onToken)
        } catch {
            if provider != .nvidia {
                try await attempt(model: "meta/llama-4-maverick-17b-128e-instruct", provider: .nvidia, messages: messages, onToken: onToken)
            } else {
                throw error
            }
        }
    }

    private func attempt(model: String,
                provider: Provider = .groq,
                messages: [Message],
                onToken: @escaping (String) -> Void) async throws {
        var req: URLRequest
        if provider == .nvidia {
            req = URLRequest(url: nvidiaURL)
        } else {
            guard !Secrets.groqKey.isEmpty else { throw GroqError.noKey }
            req = URLRequest(url: groqURL)
            req.setValue("Bearer \(Secrets.groqKey)", forHTTPHeaderField: "Authorization")
        }
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        // Web search (compound) runs tools server-side and can take a while.
        req.timeoutInterval = 180

        // Vision: messages with attachments become OpenAI-style content parts.
        let msgPayload: [[String: Any]] = messages.map { m in
            if m.role == .user && !m.attachments.isEmpty {
                var parts: [[String: Any]] = [["type": "text", "text": m.text]]
                for url in m.attachments.prefix(5) {
                    parts.append(["type": "image_url", "image_url": ["url": url]])
                }
                return ["role": m.role.rawValue, "content": parts]
            }
            return ["role": m.role.rawValue, "content": m.text]
        }
        let payload: [String: Any] = [
            "model": model,
            "stream": true,
            "temperature": 0.7,
            "top_p": 0.95,
            "max_completion_tokens": 8192,
            "messages": msgPayload,
        ]
        req.httpBody = try JSONSerialization.data(withJSONObject: payload)

        let (bytes, response) = try await URLSession.shared.bytes(for: req)
        guard let http = response as? HTTPURLResponse else { throw GroqError.http(-1) }
        guard http.statusCode == 200 else { throw GroqError.http(http.statusCode) }

        for try await line in bytes.lines {
            guard line.hasPrefix("data:") else { continue }
            let data = line.dropFirst(5).trimmingCharacters(in: .whitespaces)
            if data == "[DONE]" { break }
            guard let json = data.data(using: .utf8),
                  let obj = try? JSONSerialization.jsonObject(with: json) as? [String: Any],
                  let choices = obj["choices"] as? [[String: Any]],
                  let delta = choices.first?["delta"] as? [String: Any],
                  let content = delta["content"] as? String, !content.isEmpty
            else { continue }
            let token = content
            await MainActor.run { onToken(token) }
        }
    }

    /// Non-streaming convenience: accumulate a full completion (used by the
    /// OpenClaw agent loop for its decision/summary steps).
    func complete(model: String, messages: [Message], temperature: Double = 0.4) async throws -> String {
        var out = ""
        try await stream(model: model, messages: messages) { out += $0 }
        return out
    }
}
