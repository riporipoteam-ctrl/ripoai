import SwiftUI

/// Publishes how far the composer must lift to clear the keyboard. We drive the
/// composer manually instead of relying on SwiftUI's automatic avoidance, which
/// can be defeated by ancestors that ignore the keyboard safe area.
final class KeyboardObserver: ObservableObject {
    @Published var height: CGFloat = 0
    private var tokens: [NSObjectProtocol] = []

    init() {
        let nc = NotificationCenter.default
        tokens.append(nc.addObserver(forName: UIResponder.keyboardWillChangeFrameNotification,
                                     object: nil, queue: .main) { [weak self] n in self?.update(n) })
        tokens.append(nc.addObserver(forName: UIResponder.keyboardWillShowNotification,
                                     object: nil, queue: .main) { [weak self] n in self?.update(n) })
        tokens.append(nc.addObserver(forName: UIResponder.keyboardWillHideNotification,
                                     object: nil, queue: .main) { [weak self] _ in
            withAnimation(.easeOut(duration: 0.25)) { self?.height = 0 }
        })
    }

    deinit { tokens.forEach { NotificationCenter.default.removeObserver($0) } }

    private func update(_ note: Notification) {
        guard let end = (note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? NSValue)?.cgRectValue
        else { return }
        let screenH = UIScreen.main.bounds.height
        let overlap = max(0, screenH - end.origin.y)            // keyboard height from bottom
        let inset = KeyboardObserver.bottomSafeInset()           // home-indicator inset
        withAnimation(.easeOut(duration: 0.25)) {
            height = overlap > 1 ? max(0, overlap - inset) : 0
        }
    }

    static func bottomSafeInset() -> CGFloat {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow }?.safeAreaInsets.bottom ?? 0
    }
}
