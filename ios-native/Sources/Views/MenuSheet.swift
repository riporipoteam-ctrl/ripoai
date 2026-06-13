import SwiftUI

struct MenuSheet: View {
    @EnvironmentObject var store: AppStore
    @Environment(\.dismiss) private var dismiss
    let go: (AppScreen) -> Void
    var voiceCall: () -> Void = {}
    @State private var search = ""

    private var filtered: [ChatSession] {
        let q = search.trimmingCharacters(in: .whitespaces).lowercased()
        guard !q.isEmpty else { return store.sessions }
        return store.sessions.filter {
            $0.title.lowercased().contains(q) || $0.messages.contains { $0.text.lowercased().contains(q) }
        }
    }

    var body: some View {
        ZStack {
            GlassBackground()
            VStack(spacing: 0) {
                // Header
                HStack {
                    Text("AskAI").font(.system(size: 24, weight: .bold, design: .rounded))
                    Spacer()
                    Button {
                        store.newChat(); go(.chat)
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    } label: {
                        Image(systemName: "square.and.pencil")
                            .font(.system(size: 16, weight: .semibold))
                            .frame(width: 38, height: 38)
                            .liquidGlass(cornerRadius: 19)
                    }.buttonStyle(.plain).foregroundStyle(.primary)
                }
                .padding(.horizontal, 18).padding(.top, 18).padding(.bottom, 10)

                // Search
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                    TextField(store.t("Search chats"), text: $search)
                        .textInputAutocapitalization(.never)
                }
                .padding(.horizontal, 14).padding(.vertical, 11)
                .liquidGlass(cornerRadius: 16)
                .padding(.horizontal, 16).padding(.bottom, 10)

                ScrollView {
                    VStack(spacing: 8) {
                        // Navigation
                        NavRow(icon: "waveform", title: store.t("Voice call"), subtitle: store.t("Talk with AskAI live")) { voiceCall() }
                        NavRow(icon: "person.2", title: store.t("Agents"), subtitle: store.t("Your AI team")) { go(.team) }
                        NavRow(icon: "folder", title: store.t("Projects"), subtitle: store.t("Code with live files")) { go(.projects) }
                        NavRow(icon: "crown", title: store.t("AskAI+"), subtitle: store.t("Unlock more power")) { go(.plus) }
                        NavRow(icon: "gearshape", title: store.t("Settings"), subtitle: store.t("Models, account, appearance")) { go(.settings) }

                        // Chats
                        HStack {
                            Text(store.t("Chats")).font(.system(size: 12, weight: .bold)).foregroundStyle(.secondary)
                            Spacer()
                        }.padding(.horizontal, 4).padding(.top, 10)

                        if filtered.isEmpty {
                            Text("No chats found").font(.caption).foregroundStyle(.secondary).padding(.top, 12)
                        }
                        ForEach(filtered) { s in
                            Button { store.select(s.id); go(.chat) } label: {
                                HStack {
                                    Image(systemName: "bubble.left").foregroundStyle(.secondary)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(s.title).font(.system(size: 15, weight: .semibold)).lineLimit(1)
                                        Text(s.updated, style: .relative).font(.system(size: 11)).foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    if s.id == store.currentID {
                                        Image(systemName: "checkmark").font(.system(size: 12, weight: .bold))
                                    }
                                }
                                .padding(.horizontal, 14).padding(.vertical, 12)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .liquidGlass(cornerRadius: 18)
                            }
                            .buttonStyle(.plain).foregroundStyle(.primary)
                            .contextMenu {
                                Button(role: .destructive) { store.delete(s.id) } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                            }
                        }
                    }
                    .padding(.horizontal, 16).padding(.bottom, 28)
                }
            }
        }
    }
}

private struct NavRow: View {
    let icon: String
    let title: String
    let subtitle: String
    let action: () -> Void
    var body: some View {
        Button {
            action()
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        } label: {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 16, weight: .semibold))
                    .frame(width: 36, height: 36)
                    .background(Color.primary.opacity(0.06), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                VStack(alignment: .leading, spacing: 1) {
                    Text(title).font(.system(size: 15, weight: .semibold))
                    Text(subtitle).font(.system(size: 11)).foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(.secondary)
            }
            .padding(.horizontal, 12).padding(.vertical, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .liquidGlass(cornerRadius: 18)
        }
        .buttonStyle(.plain).foregroundStyle(.primary)
    }
}
