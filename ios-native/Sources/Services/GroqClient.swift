import Foundation

/// Streams chat completions from Groq's OpenAI-compatible API (SSE), the same
/// backend the web app uses. Token callbacks arrive on the main actor.
struct GroqClient {
    static let shared = GroqClient()
    private let endpoint = URL(string: "https://api.groq.com/openai/v1/chat/completions")!

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

    func stream(model: String,
                messages: [Message],
                onToken: @escaping (String) -> Void) async throws {
        let key = Secrets.groqKey
        guard !key.isEmpty else { throw GroqError.noKey }

        var req = URLRequest(url: endpoint)
        req.httpMethod = "POST"
        req.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let payload: [String: Any] = [
            "model": model,
            "stream": true,
            "temperature": 0.7,
            "max_completion_tokens": 4096,
            "messages": messages.map { ["role": $0.role.rawValue, "content": $0.text] },
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
}
