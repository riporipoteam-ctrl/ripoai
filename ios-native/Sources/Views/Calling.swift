import SwiftUI
import AVFoundation

// Friend voice/video calling for the native app. Signaling rides the SAME
// Firestore `calls` collection the web uses (over REST), so a call placed on
// one platform rings on another. The full-screen ringing UI shows the caller's
// name + Answer / Decline. (Live audio/video media uses WebRTC, integrated
// separately; this delivers the call + ring + answer/decline flow + screens.)

struct IncomingCall: Identifiable, Equatable {
    let id: String
    let caller: String
    let callerName: String
    let kind: String   // "audio" | "video"
}

enum CallService {
    private static func s(_ a: Any?) -> String? { (a as? [String: Any])?["stringValue"] as? String }

    static func startCall(_ user: AuthUser, calleeUid: String, calleeName: String, callerName: String, kind: String) async -> String? {
        var req = URLRequest(url: URL(string: "\(FB.docBase)/calls")!)
        req.httpMethod = "POST"
        req.setValue("Bearer \(user.idToken)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let now = Int(Date().timeIntervalSince1970 * 1000)
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["fields": [
            "caller": ["stringValue": user.uid],
            "callerName": ["stringValue": callerName],
            "callee": ["stringValue": calleeUid],
            "calleeName": ["stringValue": calleeName],
            "kind": ["stringValue": kind],
            "status": ["stringValue": "ringing"],
            "ts": ["integerValue": String(now)],
        ]])
        let data = (try? await URLSession.shared.data(for: req))?.0 ?? Data()
        let obj = ((try? JSONSerialization.jsonObject(with: data)) as? [String: Any]) ?? [:]
        if let name = obj["name"] as? String { return name.split(separator: "/").last.map(String.init) }
        return nil
    }

    static func setStatus(_ user: AuthUser, _ callId: String, _ status: String) async {
        var req = URLRequest(url: URL(string: "\(FB.docBase)/calls/\(callId)?updateMask.fieldPaths=status")!)
        req.httpMethod = "PATCH"
        req.setValue("Bearer \(user.idToken)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["fields": ["status": ["stringValue": status]]])
        _ = try? await URLSession.shared.data(for: req)
    }

    static func status(_ user: AuthUser, _ callId: String) async -> String {
        var req = URLRequest(url: URL(string: "\(FB.docBase)/calls/\(callId)")!)
        req.setValue("Bearer \(user.idToken)", forHTTPHeaderField: "Authorization")
        let data = (try? await URLSession.shared.data(for: req))?.0 ?? Data()
        let obj = ((try? JSONSerialization.jsonObject(with: data)) as? [String: Any]) ?? [:]
        return s((obj["fields"] as? [String: Any])?["status"]) ?? "ended"
    }

    static func incoming(_ user: AuthUser) async -> IncomingCall? {
        var req = URLRequest(url: URL(string: "\(FB.docBase):runQuery")!)
        req.httpMethod = "POST"
        req.setValue("Bearer \(user.idToken)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let calleeFilter: [String: Any] = ["fieldFilter": ["field": ["fieldPath": "callee"], "op": "EQUAL", "value": ["stringValue": user.uid]]]
        let statusFilter: [String: Any] = ["fieldFilter": ["field": ["fieldPath": "status"], "op": "EQUAL", "value": ["stringValue": "ringing"]]]
        let query: [String: Any] = ["structuredQuery": [
            "from": [["collectionId": "calls"]],
            "where": ["compositeFilter": ["op": "AND", "filters": [calleeFilter, statusFilter]]],
            "limit": 1,
        ]]
        req.httpBody = try? JSONSerialization.data(withJSONObject: query)
        let data = (try? await URLSession.shared.data(for: req))?.0 ?? Data()
        let arr = ((try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]]) ?? []
        for row in arr {
            guard let doc = row["document"] as? [String: Any],
                  let name = doc["name"] as? String,
                  let f = doc["fields"] as? [String: Any] else { continue }
            let id = name.split(separator: "/").last.map(String.init) ?? ""
            return IncomingCall(id: id, caller: s(f["caller"]) ?? "", callerName: s(f["callerName"]) ?? "Caller", kind: s(f["kind"]) ?? "audio")
        }
        return nil
    }
}

/// Outgoing-call request posted by a DM's call buttons.
extension Notification.Name { static let askaiStartCall = Notification.Name("askai.startCall") }

/// Mounted once (in RootView). Polls Firestore for incoming calls and rings;
/// also listens for outgoing-call requests from DM screens.
struct CallCenter: View {
    @EnvironmentObject var store: AppStore
    @State private var active: ActiveCall?
    @State private var pollTimer: Timer?

    struct ActiveCall: Identifiable { let id: String; let name: String; let kind: String; let outgoing: Bool }

    var body: some View {
        Color.clear
            .onAppear { wireCallKit(); startPolling() }
            .onDisappear { pollTimer?.invalidate() }
            .onReceive(NotificationCenter.default.publisher(for: .askaiStartCall)) { note in
                guard let info = note.userInfo as? [String: String], let uid = info["uid"], let user = store.user else { return }
                let name = info["name"] ?? "Friend"
                let kind = info["kind"] ?? "audio"
                Task {
                    if let id = await CallService.startCall(user, calleeUid: uid, calleeName: name, callerName: store.user?.email.split(separator: "@").first.map(String.init) ?? "You", kind: kind) {
                        await MainActor.run { active = ActiveCall(id: id, name: name, kind: kind, outgoing: true) }
                    }
                }
            }
            .fullScreenCover(item: $active) { a in
                ActiveCallView(call: a) {
                    if let u = store.user { Task { await CallService.setStatus(u, a.id, "ended") } }
                    CallKitManager.shared.endCall(callId: a.id)
                    active = nil
                }
                .environmentObject(store)
            }
    }

    private func wireCallKit() {
        CallKitManager.shared.onAnswer = { callId, name, kind in
            if let u = store.user { Task { await CallService.setStatus(u, callId, "active") } }
            DispatchQueue.main.async { active = ActiveCall(id: callId, name: name, kind: kind, outgoing: false) }
        }
        CallKitManager.shared.onEnd = { callId in
            if let u = store.user { Task { await CallService.setStatus(u, callId, "ended") } }
            DispatchQueue.main.async { if active?.id == callId { active = nil } }
        }
    }

    private func startPolling() {
        pollTimer?.invalidate()
        pollTimer = Timer.scheduledTimer(withTimeInterval: 4, repeats: true) { _ in
            guard let u = store.user, active == nil else { return }
            Task {
                if let c = await CallService.incoming(u), !CallKitManager.shared.isReported(c.id) {
                    await MainActor.run { CallKitManager.shared.reportIncoming(callId: c.id, name: c.callerName, kind: c.kind) }
                }
            }
        }
    }
}

struct IncomingCallView: View {
    let call: IncomingCall
    let onAnswer: () -> Void
    let onDecline: () -> Void
    @State private var pulse = false

    var body: some View {
        ZStack {
            LinearGradient(colors: [Color(hex: 0x111114), Color(hex: 0x1d1d22)], startPoint: .top, endPoint: .bottom).ignoresSafeArea()
            VStack(spacing: 18) {
                Spacer()
                Circle().fill(Color.accentColor.opacity(0.25)).frame(width: 120, height: 120)
                    .overlay(Text(String(call.callerName.prefix(1)).uppercased()).font(.system(size: 48, weight: .bold)).foregroundStyle(.white))
                    .scaleEffect(pulse ? 1.06 : 0.96)
                    .animation(.easeInOut(duration: 1).repeatForever(autoreverses: true), value: pulse)
                Text(call.callerName).font(.system(size: 26, weight: .bold)).foregroundStyle(.white)
                Text("Incoming \(call.kind) call…").font(.callout).foregroundStyle(.white.opacity(0.7))
                Spacer()
                HStack(spacing: 60) {
                    VStack(spacing: 6) {
                        Button(action: onDecline) {
                            Image(systemName: "phone.down.fill").font(.system(size: 26)).frame(width: 70, height: 70).background(Color.red, in: Circle()).foregroundStyle(.white)
                        }.buttonStyle(.plain)
                        Text("Decline").font(.caption).foregroundStyle(.white.opacity(0.8))
                    }
                    VStack(spacing: 6) {
                        Button(action: onAnswer) {
                            Image(systemName: call.kind == "video" ? "video.fill" : "phone.fill").font(.system(size: 26)).frame(width: 70, height: 70).background(Color.green, in: Circle()).foregroundStyle(.white)
                        }.buttonStyle(.plain)
                        Text("Answer").font(.caption).foregroundStyle(.white.opacity(0.8))
                    }
                }.padding(.bottom, 50)
            }
        }
        .onAppear { pulse = true; UINotificationFeedbackGenerator().notificationOccurred(.warning) }
    }
}

struct ActiveCallView: View {
    @EnvironmentObject var store: AppStore
    let call: CallCenter.ActiveCall
    let onEnd: () -> Void
    @StateObject private var rtc = WebRTCManager()
    @State private var state = "Connecting…"
    @State private var statusTimer: Timer?
    @State private var muted = false

    var body: some View {
        ZStack {
            if call.kind == "video", let remote = rtc.remoteVideoTrack {
                RTCVideoView(track: remote).ignoresSafeArea()
            } else {
                LinearGradient(colors: [Color(hex: 0x0E0E10), Color(hex: 0x1b1b20)], startPoint: .top, endPoint: .bottom).ignoresSafeArea()
            }
            VStack(spacing: 14) {
                Spacer()
                if call.kind != "video" || rtc.remoteVideoTrack == nil {
                    Image(systemName: call.kind == "video" ? "video.fill" : "phone.fill").font(.system(size: 40)).foregroundStyle(.white).frame(width: 110, height: 110).background(Color.white.opacity(0.1), in: Circle())
                    Text(call.name).font(.system(size: 24, weight: .bold)).foregroundStyle(.white)
                }
                Text(rtc.connected ? "Connected" : state).font(.callout).foregroundStyle(.white.opacity(0.8))
                Spacer()
                HStack(spacing: 28) {
                    Button { muted.toggle() } label: {
                        Image(systemName: muted ? "mic.slash.fill" : "mic.fill").font(.system(size: 22)).frame(width: 60, height: 60).background(muted ? Color.white : Color.white.opacity(0.16), in: Circle()).foregroundStyle(muted ? .black : .white)
                    }.buttonStyle(.plain)
                    Button { rtc.end(); onEnd() } label: {
                        Image(systemName: "phone.down.fill").font(.system(size: 26)).frame(width: 72, height: 72).background(Color.red, in: Circle()).foregroundStyle(.white)
                    }.buttonStyle(.plain)
                }.padding(.bottom, 50)
            }
            // local self-view PiP for video calls
            if call.kind == "video", let local = rtc.localVideoTrack {
                VStack { HStack { Spacer(); RTCVideoView(track: local).frame(width: 110, height: 150).clipShape(RoundedRectangle(cornerRadius: 14)).padding(.top, 60).padding(.trailing, 16) }; Spacer() }
            }
        }
        .onAppear {
            if let u = store.user { rtc.start(user: u, callId: call.id, isCaller: call.outgoing, kind: call.kind) }
            statusTimer = Timer.scheduledTimer(withTimeInterval: 3, repeats: true) { _ in
                guard let u = store.user else { return }
                Task { let st = await CallService.status(u, call.id); await MainActor.run { if st == "ended" { rtc.end(); onEnd() } else if call.outgoing && !rtc.connected { state = "Ringing…" } } }
            }
        }
        .onDisappear { statusTimer?.invalidate(); rtc.end() }
    }
}
