import Foundation
import CoreLocation

@MainActor
final class LocationManager: NSObject, ObservableObject, CLLocationManagerDelegate {
    static let shared = LocationManager()
    private let manager = CLLocationManager()
    @Published var authorized = false
    @Published var place = ""

    override init() {
        super.init()
        manager.delegate = self
        authorized = manager.authorizationStatus == .authorizedWhenInUse || manager.authorizationStatus == .authorizedAlways
    }

    func request() { manager.requestWhenInUseAuthorization() }

    nonisolated func locationManagerDidChangeAuthorization(_ m: CLLocationManager) {
        Task { @MainActor in
            authorized = m.authorizationStatus == .authorizedWhenInUse || m.authorizationStatus == .authorizedAlways
            if authorized { m.requestLocation() }
        }
    }
    nonisolated func locationManager(_ m: CLLocationManager, didUpdateLocations locs: [CLLocation]) {
        guard let loc = locs.last else { return }
        CLGeocoder().reverseGeocodeLocation(loc) { marks, _ in
            Task { @MainActor in
                if let p = marks?.first { self.place = [p.locality, p.administrativeArea, p.country].compactMap { $0 }.joined(separator: ", ") }
            }
        }
    }
    nonisolated func locationManager(_ m: CLLocationManager, didFailWithError error: Error) {}
}
