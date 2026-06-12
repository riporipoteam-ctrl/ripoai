import Foundation

/// Minimal Firestore REST sync. Stores chats under users/{uid}/chats/{chatId}
/// using the SAME document shape as the web app (title, messages[{role,content}],
/// updatedAt, createdAt) so a signed-in user sees the same history everywhere.
enum FirestoreSync {

    static func saveChat(_ s: ChatSession, user: AuthUser) async throws {
        let url = URL(string: "\(FB.docBase)/users/\(user.uid)/chats/\(s.id.uuidString)")!
        var req = URLRequest(url: url)
        req.httpMethod = "PATCH"
        req.setValue("Bearer \(user.idToken)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let msgValues: [[String: Any]] = s.messages
            .filter { $0.role != .system }
            .map { m in
                var f: [String: Any] = [
                    "role": ["stringValue": m.role.rawValue],
                    "content": ["stringValue": m.text],
                ]
                if let img = m.imageURL { f["imageURL"] = ["stringValue": img] }
                return ["mapValue": ["fields": f]]
            }
        let fields: [String: Any] = [
            "title": ["stringValue": s.title],
            "updatedAt": ["timestampValue": iso(s.updated)],
            "createdAt": ["timestampValue": iso(s.updated)],
            "messages": ["arrayValue": ["values": msgValues]],
            "native": ["booleanValue": true],
        ]
        req.httpBody = try JSONSerialization.data(withJSONObject: ["fields": fields])
        _ = try await URLSession.shared.data(for: req)
    }

    static func listChats(user: AuthUser) async throws -> [ChatSession] {
        let url = URL(string: "\(FB.docBase)/users/\(user.uid)/chats?pageSize=100")!
        var req = URLRequest(url: url)
        req.setValue("Bearer \(user.idToken)", forHTTPHeaderField: "Authorization")
        let (data, _) = try await URLSession.shared.data(for: req)
        let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        let docs = obj["documents"] as? [[String: Any]] ?? []
        return docs.compactMap { parse($0) }
    }

    // MARK: helpers
    private static func iso(_ d: Date) -> String {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime]
        return f.string(from: d)
    }

    private static func parse(_ doc: [String: Any]) -> ChatSession? {
        guard let name = doc["name"] as? String,
              let fields = doc["fields"] as? [String: Any] else { return nil }
        let idStr = name.split(separator: "/").last.map(String.init) ?? UUID().uuidString
        let id = UUID(uuidString: idStr) ?? UUID()
        let title = str(fields["title"]) ?? "Chat"
        let msgs = (fields["messages"] as? [String: Any])?["arrayValue"] as? [String: Any]
        let values = (msgs?["values"] as? [[String: Any]]) ?? []
        let messages: [Message] = values.compactMap { v in
            guard let mv = (v["mapValue"] as? [String: Any])?["fields"] as? [String: Any] else { return nil }
            let role = Role(rawValue: str(mv["role"]) ?? "assistant") ?? .assistant
            return Message(role: role, text: str(mv["content"]) ?? "", imageURL: str(mv["imageURL"]))
        }
        var session = ChatSession(id: id, title: title, messages: messages)
        if let ts = str(fields["updatedAt"]) {
            let f = ISO8601DateFormatter()
            session.updated = f.date(from: ts) ?? Date()
        }
        return session
    }

    private static func str(_ any: Any?) -> String? {
        (any as? [String: Any])?["stringValue"] as? String
    }
}
