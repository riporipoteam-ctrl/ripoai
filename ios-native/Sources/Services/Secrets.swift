import Foundation

/// The Groq API key is injected here at build time by CI from the
/// GROQ_API_KEY GitHub secret (the file is overwritten in the workflow).
/// Locally it stays empty; the app then shows a friendly "not configured" note.
enum Secrets {
    static let groqKey = ""
    static let elevenKey = ""
}
