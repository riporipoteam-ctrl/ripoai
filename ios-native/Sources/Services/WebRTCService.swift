import Foundation
import WebRTC
import AVFoundation

// Real peer-to-peer audio/video over WebRTC. Signaling rides the SAME Firestore
// `calls/{id}` doc + callerCandidates/calleeCandidates subcollections the web
// uses (calls.ts), so a native call interops with the web. REST polling stands
// in for onSnapshot.

final class WebRTCManager: NSObject, ObservableObject, RTCPeerConnectionDelegate {
    static let factory: RTCPeerConnectionFactory = {
        RTCInitializeSSL()
        return RTCPeerConnectionFactory(encoderFactory: RTCDefaultVideoEncoderFactory(),
                                        decoderFactory: RTCDefaultVideoDecoderFactory())
    }()

    @Published var remoteVideoTrack: RTCVideoTrack?
    @Published var localVideoTrack: RTCVideoTrack?
    @Published var connected = false

    private var pc: RTCPeerConnection?
    private var capturer: RTCCameraVideoCapturer?
    private var user: AuthUser?
    private var callId = ""
    private var isCaller = false
    private var kind = "audio"
    private var localTag: String { isCaller ? "callerCandidates" : "calleeCandidates" }
    private var remoteTag: String { isCaller ? "calleeCandidates" : "callerCandidates" }
    private var timer: Timer?
    private var remoteSet = false
    private var answering = false
    private var seen = Set<String>()

    func start(user: AuthUser, callId: String, isCaller: Bool, kind: String) {
        self.user = user; self.callId = callId; self.isCaller = isCaller; self.kind = kind
        configureAudio()
        let cfg = RTCConfiguration()
        cfg.iceServers = [RTCIceServer(urlStrings: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"])]
        cfg.sdpSemantics = .unifiedPlan
        let none = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
        pc = WebRTCManager.factory.peerConnection(with: cfg, constraints: none, delegate: self)
        addLocalMedia()
        if isCaller { makeOffer() }
        timer = Timer.scheduledTimer(withTimeInterval: 1.5, repeats: true) { [weak self] _ in self?.poll() }
    }

    func end() {
        timer?.invalidate()
        capturer?.stopCapture()
        pc?.close()
        pc = nil
        let s = RTCAudioSession.sharedInstance()
        s.lockForConfiguration(); try? s.setActive(false); s.unlockForConfiguration()
    }

    private func configureAudio() {
        let s = RTCAudioSession.sharedInstance()
        s.lockForConfiguration()
        try? s.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth, .defaultToSpeaker])
        try? s.setActive(true)
        s.unlockForConfiguration()
    }

    private func addLocalMedia() {
        let none = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
        let audioSource = WebRTCManager.factory.audioSource(with: none)
        let audio = WebRTCManager.factory.audioTrack(with: audioSource, trackId: "audio0")
        pc?.add(audio, streamIds: ["stream0"])
        if kind == "video" {
            let source = WebRTCManager.factory.videoSource()
            let cap = RTCCameraVideoCapturer(delegate: source)
            capturer = cap
            let track = WebRTCManager.factory.videoTrack(with: source, trackId: "video0")
            pc?.add(track, streamIds: ["stream0"])
            DispatchQueue.main.async { self.localVideoTrack = track }
            startCapture(cap)
        }
    }

    private func startCapture(_ cap: RTCCameraVideoCapturer) {
        let devices = RTCCameraVideoCapturer.captureDevices()
        guard let device = devices.first(where: { $0.position == .front }) ?? devices.first else { return }
        let formats = RTCCameraVideoCapturer.supportedFormats(for: device)
        let format = formats.min(by: { a, b in
            let da = CMVideoFormatDescriptionGetDimensions(a.formatDescription)
            let db = CMVideoFormatDescriptionGetDimensions(b.formatDescription)
            return abs(Int(da.width) - 720) < abs(Int(db.width) - 720)
        }) ?? formats.last
        guard let f = format else { return }
        let fps = f.videoSupportedFrameRateRanges.map { $0.maxFrameRate }.max() ?? 30
        cap.startCapture(with: device, format: f, fps: Int(fps))
    }

    private func makeOffer() {
        let c = RTCMediaConstraints(mandatoryConstraints: ["OfferToReceiveAudio": "true", "OfferToReceiveVideo": kind == "video" ? "true" : "false"], optionalConstraints: nil)
        pc?.offer(for: c) { [weak self] sdp, _ in
            guard let self, let sdp else { return }
            self.pc?.setLocalDescription(sdp) { _ in
                self.patchSDP(field: "offer", sdp: sdp)
            }
        }
    }

    private func makeAnswer() {
        if answering || remoteSet { return }
        answering = true
        Task {
            guard let offer = await fetchSDP(field: "offer") else { self.answering = false; return }
            pc?.setRemoteDescription(offer) { [weak self] _ in
                guard let self else { return }
                self.remoteSet = true
                let c = RTCMediaConstraints(mandatoryConstraints: ["OfferToReceiveAudio": "true", "OfferToReceiveVideo": self.kind == "video" ? "true" : "false"], optionalConstraints: nil)
                self.pc?.answer(for: c) { sdp, _ in
                    guard let sdp else { return }
                    self.pc?.setLocalDescription(sdp) { _ in self.patchSDP(field: "answer", sdp: sdp) }
                }
            }
        }
    }

    private func poll() {
        guard let user else { return }
        Task {
            // caller waits for the answer
            if isCaller, !remoteSet, let ans = await fetchSDP(field: "answer") {
                remoteSet = true
                pc?.setRemoteDescription(ans) { _ in }
            }
            // callee answers once the offer is available
            if !isCaller, !remoteSet, !answering { makeAnswer() }
            // remote ICE candidates
            let cands = await listCandidates(remoteTag)
            for c in cands where !seen.contains(c.0) {
                seen.insert(c.0)
                pc?.add(c.1) { _ in }
            }
            _ = user
        }
    }

    // MARK: REST signaling
    private func docURL(_ extra: String = "") -> URL { URL(string: "\(FB.docBase)/calls/\(callId)\(extra)")! }

    private func patchSDP(field: String, sdp: RTCSessionDescription) {
        guard let user else { return }
        var req = URLRequest(url: docURL("?updateMask.fieldPaths=\(field)&updateMask.fieldPaths=status"))
        req.httpMethod = "PATCH"
        req.setValue("Bearer \(user.idToken)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let typeStr = field == "offer" ? "offer" : "answer"
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["fields": [
            field: ["mapValue": ["fields": ["type": ["stringValue": typeStr], "sdp": ["stringValue": sdp.sdp]]]],
            "status": ["stringValue": field == "offer" ? "ringing" : "active"],
        ]])
        URLSession.shared.dataTask(with: req).resume()
    }

    private func fetchSDP(field: String) async -> RTCSessionDescription? {
        guard let user else { return nil }
        var req = URLRequest(url: docURL())
        req.setValue("Bearer \(user.idToken)", forHTTPHeaderField: "Authorization")
        let data = (try? await URLSession.shared.data(for: req))?.0 ?? Data()
        let obj = ((try? JSONSerialization.jsonObject(with: data)) as? [String: Any]) ?? [:]
        guard let fields = obj["fields"] as? [String: Any],
              let m = (fields[field] as? [String: Any])?["mapValue"] as? [String: Any],
              let f = m["fields"] as? [String: Any],
              let sdp = (f["sdp"] as? [String: Any])?["stringValue"] as? String else { return nil }
        let typeStr = (f["type"] as? [String: Any])?["stringValue"] as? String ?? field
        let type: RTCSdpType = typeStr == "offer" ? .offer : .answer
        return RTCSessionDescription(type: type, sdp: sdp)
    }

    private func postCandidate(_ c: RTCIceCandidate) {
        guard let user else { return }
        var req = URLRequest(url: docURL("/\(localTag)"))
        req.httpMethod = "POST"
        req.setValue("Bearer \(user.idToken)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        var fields: [String: Any] = [
            "candidate": ["stringValue": c.sdp],
            "sdpMLineIndex": ["integerValue": String(c.sdpMLineIndex)],
        ]
        if let mid = c.sdpMid { fields["sdpMid"] = ["stringValue": mid] }
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["fields": fields])
        URLSession.shared.dataTask(with: req).resume()
    }

    private func listCandidates(_ tag: String) async -> [(String, RTCIceCandidate)] {
        guard let user else { return [] }
        var req = URLRequest(url: docURL("/\(tag)?pageSize=50"))
        req.setValue("Bearer \(user.idToken)", forHTTPHeaderField: "Authorization")
        let data = (try? await URLSession.shared.data(for: req))?.0 ?? Data()
        let obj = ((try? JSONSerialization.jsonObject(with: data)) as? [String: Any]) ?? [:]
        let docs = obj["documents"] as? [[String: Any]] ?? []
        var out: [(String, RTCIceCandidate)] = []
        for d in docs {
            guard let name = d["name"] as? String, let f = d["fields"] as? [String: Any],
                  let cand = (f["candidate"] as? [String: Any])?["stringValue"] as? String else { continue }
            let id = name.split(separator: "/").last.map(String.init) ?? cand
            let idx = Int32((f["sdpMLineIndex"] as? [String: Any])?["integerValue"] as? String ?? "0") ?? 0
            let mid = (f["sdpMid"] as? [String: Any])?["stringValue"] as? String
            out.append((id, RTCIceCandidate(sdp: cand, sdpMLineIndex: idx, sdpMid: mid)))
        }
        return out
    }

    // MARK: RTCPeerConnectionDelegate
    func peerConnection(_ pc: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) { postCandidate(candidate) }
    func peerConnection(_ pc: RTCPeerConnection, didChange newState: RTCIceConnectionState) {
        DispatchQueue.main.async { self.connected = (newState == .connected || newState == .completed) }
    }
    func peerConnection(_ pc: RTCPeerConnection, didAdd rtpReceiver: RTCRtpReceiver, streams: [RTCMediaStream]) {
        if let track = rtpReceiver.track as? RTCVideoTrack {
            DispatchQueue.main.async { self.remoteVideoTrack = track }
        }
    }
    func peerConnection(_ pc: RTCPeerConnection, didAdd stream: RTCMediaStream) {
        if let track = stream.videoTracks.first { DispatchQueue.main.async { self.remoteVideoTrack = track } }
    }
    func peerConnection(_ pc: RTCPeerConnection, didRemove stream: RTCMediaStream) {}
    func peerConnectionShouldNegotiate(_ pc: RTCPeerConnection) {}
    func peerConnection(_ pc: RTCPeerConnection, didChange newState: RTCSignalingState) {}
    func peerConnection(_ pc: RTCPeerConnection, didChange newState: RTCIceGatheringState) {}
    func peerConnection(_ pc: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}
    func peerConnection(_ pc: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {}
}

// SwiftUI wrapper around RTCMTLVideoView for rendering a track.
import SwiftUI
struct RTCVideoView: UIViewRepresentable {
    let track: RTCVideoTrack?
    func makeUIView(context: Context) -> RTCMTLVideoView {
        let v = RTCMTLVideoView()
        v.videoContentMode = .scaleAspectFill
        return v
    }
    func updateUIView(_ uiView: RTCMTLVideoView, context: Context) {
        track?.add(uiView)
    }
}
