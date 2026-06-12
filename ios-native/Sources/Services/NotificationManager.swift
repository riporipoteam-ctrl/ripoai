import Foundation
import UserNotifications
import UIKit

@MainActor
final class NotificationManager: NSObject, UNUserNotificationCenterDelegate {
    static let shared = NotificationManager()
    private let center = UNUserNotificationCenter.current()

    func configure() { center.delegate = self }

    func requestAuth() async -> Bool {
        (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
    }

    /// Fire when a long task finishes — most useful while the app is backgrounded.
    func taskDone(_ title: String, _ body: String) {
        guard UIApplication.shared.applicationState != .active else { return }
        let c = UNMutableNotificationContent()
        c.title = title; c.body = body; c.sound = .default
        center.add(UNNotificationRequest(identifier: UUID().uuidString, content: c, trigger: nil))
    }

    /// Schedule a recurring personalized check-in (daily/weekly/monthly).
    func scheduleCheckins(_ freq: String) {
        center.removePendingNotificationRequests(withIdentifiers: ["askai.checkin"])
        guard freq != "off" else { return }
        var date = DateComponents()
        date.hour = 9
        switch freq {
        case "weekly": date.weekday = 2          // Monday 9am
        case "monthly": date.day = 1             // 1st of month 9am
        default: break                            // daily 9am
        }
        let c = UNMutableNotificationContent()
        c.title = "AskAI"
        c.body = "Want a hand today? Tap to pick up where we left off or start something new."
        c.sound = .default
        let trigger = UNCalendarNotificationTrigger(dateMatching: date, repeats: true)
        center.add(UNNotificationRequest(identifier: "askai.checkin", content: c, trigger: trigger))
    }

    // Show banners even while the app is in the foreground (for check-ins).
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter,
                                            willPresent notification: UNNotification) async
        -> UNNotificationPresentationOptions { [.banner, .sound] }
}
