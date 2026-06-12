import Foundation
#if canImport(ActivityKit)
import ActivityKit

/// Live Activity data for a running AskAI task or voice call (Dynamic Island).
struct AskAIActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var status: String      // e.g. "Thinking", "Searching the web", "On a call"
        var detail: String      // short subtitle / last words
        var progress: Double    // 0...1 (indeterminate shown when 0)
        var isVoiceCall: Bool
    }
    var title: String           // chat title / "Voice call"
}
#endif
