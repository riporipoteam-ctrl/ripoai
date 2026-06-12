import SwiftUI
import AVFoundation
import CoreImage

/// Continuous camera frames for live vision. Uses AVCaptureVideoDataOutput so
/// the most recent frame is always available (far more reliable than one-shot
/// photo capture), exposing a live `preview` image and a JPEG data URL for the
/// vision model. Used by the voice call (camera-in-call) and Live Camera.
final class CameraFrameProvider: NSObject, ObservableObject {
    @Published var preview: UIImage?
    @Published var authorized = true

    let session = AVCaptureSession()
    private let output = AVCaptureVideoDataOutput()
    private let queue = DispatchQueue(label: "askai.camera.frames")
    private let ciContext = CIContext(options: nil)
    private var position: AVCaptureDevice.Position = .back
    private var running = false
    private var lastConvert = Date.distantPast

    private let lock = NSLock()
    private var _latest: UIImage?

    func start(position: AVCaptureDevice.Position = .back) {
        self.position = position
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            queue.async { [weak self] in self?.configure() }
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                DispatchQueue.main.async { self?.authorized = granted }
                if granted { self?.queue.async { self?.configure() } }
            }
        default:
            DispatchQueue.main.async { self.authorized = false }
        }
    }

    private func configure() {
        guard !running else { return }
        session.beginConfiguration()
        session.sessionPreset = .vga640x480
        session.inputs.forEach { session.removeInput($0) }
        if let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position),
           let input = try? AVCaptureDeviceInput(device: device), session.canAddInput(input) {
            session.addInput(input)
        }
        if session.outputs.isEmpty {
            output.alwaysDiscardsLateVideoFrames = true
            output.setSampleBufferDelegate(self, queue: queue)
            if session.canAddOutput(output) { session.addOutput(output) }
        }
        session.commitConfiguration()
        session.startRunning()
        running = true
    }

    func flip() {
        let next: AVCaptureDevice.Position = position == .back ? .front : .back
        queue.async { [weak self] in
            guard let self else { return }
            self.session.beginConfiguration()
            self.session.inputs.forEach { self.session.removeInput($0) }
            self.position = next
            if let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: next),
               let input = try? AVCaptureDeviceInput(device: device), self.session.canAddInput(input) {
                self.session.addInput(input)
            }
            self.session.commitConfiguration()
        }
    }

    func stop() {
        queue.async { [weak self] in
            guard let self, self.session.isRunning else { return }
            self.session.stopRunning(); self.running = false
        }
    }

    /// Latest frame as a JPEG data URL for the vision model.
    func latestDataURL(maxSide: CGFloat = 1024, quality: CGFloat = 0.6) -> String? {
        lock.lock(); let img = _latest; lock.unlock()
        guard let resized = img?.resized(maxSide: maxSide),
              let jpeg = resized.jpegData(compressionQuality: quality) else { return nil }
        return "data:image/jpeg;base64,\(jpeg.base64EncodedString())"
    }
}

extension CameraFrameProvider: AVCaptureVideoDataOutputSampleBufferDelegate {
    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer,
                       from connection: AVCaptureConnection) {
        let now = Date()
        guard now.timeIntervalSince(lastConvert) > 0.2 else { return }   // ~5fps
        lastConvert = now
        guard let pb = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        let ci = CIImage(cvPixelBuffer: pb)
        guard let cg = ciContext.createCGImage(ci, from: ci.extent) else { return }
        let orientation: UIImage.Orientation = position == .front ? .leftMirrored : .right
        let img = UIImage(cgImage: cg, scale: 1, orientation: orientation)
        lock.lock(); _latest = img; lock.unlock()
        DispatchQueue.main.async { [weak self] in self?.preview = img }
    }
}
