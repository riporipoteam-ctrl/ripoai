import SwiftUI

@main
struct AskAIApp: App {
    @StateObject private var store = AppStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
                .tint(Color.accentColor)
        }
    }
}
