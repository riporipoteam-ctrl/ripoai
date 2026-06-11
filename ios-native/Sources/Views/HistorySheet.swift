import SwiftUI

struct HistorySheet: View {
    @EnvironmentObject var store: AppStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            GlassBackground()
            VStack(spacing: 0) {
                HStack {
                    Text("Chats").font(.system(size: 22, weight: .bold, design: .rounded))
                    Spacer()
                    Button { store.newChat(); dismiss() } label: {
                        Label("New", systemImage: "square.and.pencil").font(.system(size: 14, weight: .bold))
                            .padding(.horizontal, 12).padding(.vertical, 8).liquidGlass(cornerRadius: 16)
                    }.buttonStyle(.plain).foregroundStyle(.primary)
                }
                .padding(.horizontal, 18).padding(.top, 18).padding(.bottom, 10)

                ScrollView {
                    VStack(spacing: 8) {
                        ForEach(store.sessions) { s in
                            Button { store.select(s.id); dismiss() } label: {
                                HStack {
                                    Image(systemName: "bubble.left.and.bubble.right").foregroundStyle(Color.accentColor)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(s.title).font(.system(size: 15, weight: .semibold)).lineLimit(1)
                                        Text(s.updated, style: .relative).font(.system(size: 11)).foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    if s.id == store.currentID { Image(systemName: "checkmark").foregroundStyle(Color.accentColor) }
                                }
                                .padding(.horizontal, 14).padding(.vertical, 12)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .liquidGlass(cornerRadius: 18)
                            }
                            .buttonStyle(.plain).foregroundStyle(.primary)
                            .contextMenu {
                                Button(role: .destructive) { store.delete(s.id) } label: { Label("Delete", systemImage: "trash") }
                            }
                        }
                    }
                    .padding(.horizontal, 16).padding(.bottom, 24)
                }
            }
        }
    }
}
