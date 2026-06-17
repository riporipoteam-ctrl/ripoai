import Foundation
import CallKit
import AVFoundation

// CallKit — the real iOS system incoming-call UI (full-screen, lock-screen-
// capable while the app is alive) with Answer/Decline + caller name. The
// callbacks drive WebRTC connect / Firestore status. (Ringing when the app is
// fully terminated additionally needs a VoIP PushKit certificate from your
// Apple Developer account + a push server — wired separately.)
final class CallKitManager: NSObject, CXProviderDelegate {
    static let shared = CallKitManager()
    private let provider: CXProvider
    private var map: [UUID: (callId: String, name: String, kind: String)] = [:]

    /// Set by CallCenter to react to the user's CallKit choices.
    var onAnswer: ((String, String, String) -> Void)?  // callId, name, kind
    var onEnd: ((String) -> Void)?                      // callId

    override init() {
        let cfg = CXProviderConfiguration()
        cfg.supportsVideo = true
        cfg.maximumCallsPerCallGroup = 1
        cfg.maximumCallGroups = 1
        cfg.supportedHandleTypes = [.generic]
        provider = CXProvider(configuration: cfg)
        super.init()
        provider.setDelegate(self, queue: nil)
    }

    /// True if we've already surfaced this Firestore call (dedupe the poll).
    func isReported(_ callId: String) -> Bool { map.values.contains { $0.callId == callId } }

    func reportIncoming(callId: String, name: String, kind: String) {
        if isReported(callId) { return }
        let uuid = UUID()
        map[uuid] = (callId, name, kind)
        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: name)
        update.localizedCallerName = name
        update.hasVideo = (kind == "video")
        provider.reportNewIncomingCall(with: uuid, update: update) { error in
            if error != nil { self.map.removeValue(forKey: uuid) }
        }
    }

    func endCall(callId: String) {
        for (uuid, info) in map where info.callId == callId {
            provider.reportCall(with: uuid, endedAt: Date(), reason: .remoteEnded)
            map.removeValue(forKey: uuid)
        }
    }

    // MARK: CXProviderDelegate
    func providerDidReset(_ provider: CXProvider) { map.removeAll() }

    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        if let info = map[action.callUUID] { onAnswer?(info.callId, info.name, info.kind) }
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        if let info = map[action.callUUID] { onEnd?(info.callId) }
        map.removeValue(forKey: action.callUUID)
        action.fulfill()
    }

    func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {}
    func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {}
}
