import SwiftUI

@main
struct AskAIApp: App {
    @StateObject private var store = AppStore()

    var body: some Scene {
        WindowGroup {
            Group {
                if store.user != nil || store.guest {
                    RootView()
                } else {
                    AuthView()
                }
            }
            .environmentObject(store)
            .tint(Color.accentColor)
            .animation(.easeInOut, value: store.user)
            .animation(.easeInOut, value: store.guest)
            .onAppear { NotificationManager.shared.configure() }
        }
    }
}
