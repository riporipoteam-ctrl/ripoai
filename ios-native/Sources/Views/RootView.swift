import SwiftUI

struct RootView: View {
    @EnvironmentObject var store: AppStore
    @State private var showHistory = false
    @State private var showSettings = false

    var body: some View {
        ZStack {
            GlassBackground()
            ChatScreen(showHistory: $showHistory, showSettings: $showSettings)
        }
        .sheet(isPresented: $showHistory) {
            HistorySheet().environmentObject(store)
                .presentationDetents([.medium, .large])
                .presentationBackground(.clear)
        }
        .sheet(isPresented: $showSettings) {
            SettingsSheet().environmentObject(store)
                .presentationDetents([.medium])
                .presentationBackground(.clear)
        }
    }
}
