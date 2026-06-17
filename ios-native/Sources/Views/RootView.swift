import SwiftUI

enum AppScreen { case chat, team, projects, settings, plus, friends }

struct RootView: View {
    @EnvironmentObject var store: AppStore
    @State private var screen: AppScreen = {
        let a = ProcessInfo.processInfo.arguments
        if a.contains("-demo-settings") { return .settings }
        if a.contains("-demo-plus") { return .plus }
        return .chat
    }()
    @State private var showMenu = ProcessInfo.processInfo.arguments.contains("-demo-menu")
    @State private var showVoiceCall = false

    var body: some View {
        Group {
            switch screen {
            case .chat:
                ChatScreen(showMenu: $showMenu)
            case .team:
                TeamScreen(back: { screen = .chat })
            case .projects:
                ProjectsScreen(back: { screen = .chat })
            case .settings:
                SettingsScreen(back: { screen = .chat })
            case .plus:
                PlusScreen(back: { screen = .chat })
            case .friends:
                FriendsScreen(back: { screen = .chat })
            }
        }
        // Background must NOT be a ZStack sibling — a sibling that ignores the
        // keyboard safe area defeats the composer's keyboard avoidance. As a
        // .background it fills behind while the screen keeps its safe areas.
        .background(GlassBackground())
        .sheet(isPresented: $showMenu) {
            MenuSheet(
                go: { dest in showMenu = false; screen = dest },
                voiceCall: { showMenu = false; showVoiceCall = true }
            )
            .environmentObject(store)
            .presentationDetents([.large])
            .presentationBackground(.clear)
        }
        .fullScreenCover(isPresented: $showVoiceCall) {
            VoiceCallScreen().environmentObject(store)
        }
        .fullScreenCover(isPresented: $store.requestVoiceCall) {
            VoiceCallScreen().environmentObject(store)
        }
        .fullScreenCover(isPresented: $store.requestLiveCamera) {
            CameraVisionView().environmentObject(store)
        }
        .fullScreenCover(isPresented: $store.requestScreenVision) {
            ScreenVisionView().environmentObject(store)
        }
        .sheet(isPresented: $store.showAgentPanel) {
            if let agent = store.agent {
                AgentBrowserPanel(agent: agent) { store.showAgentPanel = false }
                    .padding(.top, 6)
                    .presentationDetents([.large])
                    .presentationBackground(.clear)
                    .presentationDragIndicator(.visible)
            }
        }
        .preferredColorScheme(store.colorScheme)
    }
}
