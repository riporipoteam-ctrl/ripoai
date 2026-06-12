import ReplayKit
import VideoToolbox
import UIKit

/// Broadcast upload extension: receives system-wide screen frames and writes a
/// throttled JPEG of the latest frame into the shared App Group container so the
/// AskAI app can send it to the vision model ("AskAI sees your screen").
class SampleHandler: RPBroadcastSampleHandler {
    private var lastWrite = Date.distantPast
    private let minInterval: TimeInterval = 1.2

    override func broadcastStarted(withSetupInfo setupInfo: [String: NSObject]?) {
        if let url = ScreenShare.flagURL() {
            try? Data([1]).write(to: url, options: .atomic)
        }
    }

    override func broadcastFinished() {
        if let url = ScreenShare.flagURL() { try? FileManager.default.removeItem(at: url) }
    }

    override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, with sampleBufferType: RPSampleBufferType) {
        guard sampleBufferType == .video else { return }
        let now = Date()
        guard now.timeIntervalSince(lastWrite) >= minInterval else { return }
        lastWrite = now

        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        var cgImage: CGImage?
        VTCreateCGImageFromCVPixelBuffer(pixelBuffer, options: nil, imageOut: &cgImage)
        guard let cg = cgImage else { return }

        // Downscale to keep the vision payload small.
        let maxSide: CGFloat = 1100
        let w = CGFloat(cg.width), h = CGFloat(cg.height)
        let scale = min(1, maxSide / max(w, h))
        let size = CGSize(width: w * scale, height: h * scale)
        let renderer = UIGraphicsImageRenderer(size: size)
        let img = renderer.image { _ in
            UIImage(cgImage: cg).draw(in: CGRect(origin: .zero, size: size))
        }
        guard let jpeg = img.jpegData(compressionQuality: 0.45),
              let url = ScreenShare.frameURL() else { return }
        try? jpeg.write(to: url, options: .atomic)
    }
}
