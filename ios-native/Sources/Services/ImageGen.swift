import Foundation

/// Image generation through the SAME NVIDIA proxy worker the website uses
/// (FLUX), with a Pollinations URL as last-resort fallback.
enum ImageGen {
    static let root = "https://ripoai-nvidia.ripo-ripoteam.workers.dev"

    static func generate(prompt: String) async -> String {
        // Try NVIDIA (the web app's primary) up to 2 times.
        for attempt in 0..<2 {
            if let dataURL = try? await nvidia(prompt: prompt, seed: Int.random(in: 0..<1_000_000) + attempt) {
                return dataURL
            }
        }
        // Fallback: Pollinations FLUX URL (always renders something).
        let enc = prompt.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? prompt
        return "https://image.pollinations.ai/prompt/\(enc)?width=1024&height=1024&seed=\(Int.random(in: 0..<999999))&model=flux&nologo=true"
    }

    private static func nvidia(prompt: String, seed: Int) async throws -> String {
        var req = URLRequest(url: URL(string: "\(root)/image/generate")!)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.timeoutInterval = 60
        req.httpBody = try JSONSerialization.data(withJSONObject: [
            "prompt": String(prompt.prefix(9000)),
            "width": 1024, "height": 1024, "steps": 4, "cfg_scale": 4.2, "seed": seed,
        ])
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard (resp as? HTTPURLResponse)?.statusCode == 200 else { throw URLError(.badServerResponse) }
        let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        let b64 = (obj["image"] as? String)
            ?? ((obj["artifacts"] as? [[String: Any]])?.first?["base64"] as? String)
            ?? (((obj["data"] as? [[String: Any]])?.first?["b64_json"]) as? String)
            ?? (obj["b64_json"] as? String)
            ?? ((obj["images"] as? [String])?.first)
        guard let b64 else { throw URLError(.cannotParseResponse) }
        return b64.hasPrefix("data:") ? b64 : "data:image/jpeg;base64,\(b64)"
    }
}
