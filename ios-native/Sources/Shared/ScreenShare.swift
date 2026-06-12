import Foundation

/// Shared constants + helpers for screen sharing between the app and the
/// ReplayKit broadcast upload extension via an App Group container.
enum ScreenShare {
    static let appGroup = "group.io.github.riporipoteam.ripoai"
    static let frameFile = "screen.jpg"
    static let flagFile = "broadcasting.flag"

    static func containerURL() -> URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup)
    }
    static func frameURL() -> URL? { containerURL()?.appendingPathComponent(frameFile) }
    static func flagURL() -> URL? { containerURL()?.appendingPathComponent(flagFile) }

    /// Latest screen JPEG written by the broadcast extension, if any.
    static func latestFrame() -> Data? {
        guard let url = frameURL() else { return nil }
        return try? Data(contentsOf: url)
    }

    static var isAvailable: Bool { containerURL() != nil }
}
