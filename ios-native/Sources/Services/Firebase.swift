import Foundation

/// Firebase project config (public web keys — safe to ship; access is governed
/// by Auth + Firestore rules). The native app talks to Firebase over REST so it
/// needs no native SDK and shares the SAME account/uid/data as the web app.
enum FB {
    static let apiKey = "AIzaSyA-4hkATjzLE-nS0eDf09qs_8MWGc_iRPA"
    static let projectID = "ripoai-dff5d"
    static var docBase: String {
        "https://firestore.googleapis.com/v1/projects/\(projectID)/databases/(default)/documents"
    }
}

struct AuthUser: Codable, Equatable {
    var uid: String
    var email: String
    var idToken: String
    var refreshToken: String
}

enum AuthError: LocalizedError {
    case message(String)
    var errorDescription: String? {
        switch self {
        case .message(let m): return m.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }
}

enum AuthService {
    private static func identityURL(_ path: String) -> URL {
        URL(string: "https://identitytoolkit.googleapis.com/v1/accounts:\(path)?key=\(FB.apiKey)")!
    }

    static func signUp(email: String, password: String) async throws -> AuthUser {
        try await authRequest(identityURL("signUp"), email: email, password: password)
    }

    static func signIn(email: String, password: String) async throws -> AuthUser {
        try await authRequest(identityURL("signInWithPassword"), email: email, password: password)
    }

    private static func authRequest(_ url: URL, email: String, password: String) async throws -> AuthUser {
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: [
            "email": email, "password": password, "returnSecureToken": true,
        ])
        let (data, resp) = try await URLSession.shared.data(for: req)
        let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        if let http = resp as? HTTPURLResponse, http.statusCode != 200 {
            let msg = ((obj["error"] as? [String: Any])?["message"] as? String) ?? "Sign-in failed"
            throw AuthError.message(msg)
        }
        guard let idToken = obj["idToken"] as? String,
              let refresh = obj["refreshToken"] as? String,
              let uid = obj["localId"] as? String else {
            throw AuthError.message("Unexpected response")
        }
        return AuthUser(uid: uid, email: obj["email"] as? String ?? email, idToken: idToken, refreshToken: refresh)
    }

    /// Exchange a refresh token for a fresh id token (id tokens expire hourly).
    static func refresh(_ user: AuthUser) async throws -> AuthUser {
        var req = URLRequest(url: URL(string: "https://securetoken.googleapis.com/v1/token?key=\(FB.apiKey)")!)
        req.httpMethod = "POST"
        req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        req.httpBody = "grant_type=refresh_token&refresh_token=\(user.refreshToken)".data(using: .utf8)
        let (data, _) = try await URLSession.shared.data(for: req)
        let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        guard let idToken = obj["id_token"] as? String else { throw AuthError.message("Session expired") }
        var u = user
        u.idToken = idToken
        if let r = obj["refresh_token"] as? String { u.refreshToken = r }
        if let uid = obj["user_id"] as? String { u.uid = uid }
        return u
    }
}
