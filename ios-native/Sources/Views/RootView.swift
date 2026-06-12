import SwiftUI

enum AppScreen { case chat, team, projects, settings }

struct RootView: View {
    @EnvironmentObject var store: AppStore
    @State private var screen: AppScreen = .chat
    @State private var showMenu = false

    var body: some View {
        ZStack {
            GlassBackground()
            switch screen {
            case .chat:
                ChatScreen(showMenu: $showMenu)
            case .team:
                TeamScreen(back: { screen = .chat })
            case .projects:
                ProjectsScreen(back: { screen = .chat })
            case .settings:
                SettingsScreen(back: { screen = .chat })
            }
        }
        .sheet(isPresented: $showMenu) {
            MenuSheet(go: { dest in
                showMenu = false
                screen = dest
            })
            .environmentObject(store)
            .presentationDetents([.large])
            .presentationBackground(.clear)
        }
        .preferredColorScheme(store.colorScheme)
    }
}
