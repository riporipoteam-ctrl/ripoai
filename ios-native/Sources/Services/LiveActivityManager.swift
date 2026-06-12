import Foundation
#if canImport(ActivityKit)
import ActivityKit
#endif

/// Drives the Dynamic Island / Lock-Screen Live Activity for running tasks and
/// voice calls. Safe no-ops on simulators or OS versions without ActivityKit.
@MainActor
final class LiveActivityManager {
    static let shared = LiveActivityManager()
    private init() {}

    #if canImport(ActivityKit)
    private var activity: Activity<AskAIActivityAttributes>?

    private var enabled: Bool {
        if #available(iOS 16.2, *) {
            return ActivityAuthorizationInfo().areActivitiesEnabled
        }
        return false
    }

    /// Begin a new Live Activity for a task (or reuse the existing one).
    func start(title: String, status: String, detail: String = "",
               progress: Double = 0, isVoiceCall: Bool = false) {
        guard #available(iOS 16.2, *), enabled else { return }
        let state = AskAIActivityAttributes.ContentState(
            status: status, detail: detail, progress: progress, isVoiceCall: isVoiceCall)
        // If one is already live, just update it instead of stacking.
        if activity != nil {
            update(status: status, detail: detail, progress: progress, isVoiceCall: isVoiceCall)
            return
        }
        let attrs = AskAIActivityAttributes(title: title)
        do {
            activity = try Activity.request(
                attributes: attrs,
                content: .init(state: state, staleDate: nil),
                pushType: nil)
        } catch {
            activity = nil
        }
    }

    /// Update the live state (status text / progress / waveform).
    func update(status: String, detail: String = "",
                progress: Double = 0, isVoiceCall: Bool = false) {
        guard #available(iOS 16.2, *), let activity else { return }
        let state = AskAIActivityAttributes.ContentState(
            status: status, detail: detail, progress: progress, isVoiceCall: isVoiceCall)
        Task { await activity.update(.init(state: state, staleDate: nil)) }
    }

    /// End and clear the activity.
    func end() {
        guard #available(iOS 16.2, *), let activity else { return }
        let a = activity
        self.activity = nil
        Task { await a.end(nil, dismissalPolicy: .immediate) }
    }
    #else
    func start(title: String, status: String, detail: String = "",
               progress: Double = 0, isVoiceCall: Bool = false) {}
    func update(status: String, detail: String = "",
                progress: Double = 0, isVoiceCall: Bool = false) {}
    func end() {}
    #endif
}
