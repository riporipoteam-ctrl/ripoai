import SwiftUI

struct SettingsSheet: View {
    @EnvironmentObject var store: AppStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            GlassBackground()
            VStack(alignment: .leading, spacing: 16) {
                Text("Settings").font(.system(size: 22, weight: .bold, design: .rounded))
                    .padding(.top, 18)

                Text("Model").font(.system(size: 13, weight: .bold)).foregroundStyle(.secondary)
                VStack(spacing: 8) {
                    ForEach(AIModel.all) { m in
                        Button { store.model = m } label: {
                            HStack {
                                Text(m.name).font(.system(size: 15, weight: .semibold))
                                Spacer()
                                if store.model.id == m.id { Image(systemName: "checkmark.circle.fill").foregroundStyle(Color.accentColor) }
                            }
                            .padding(.horizontal, 14).padding(.vertical, 13)
                            .frame(maxWidth: .infinity)
                            .liquidGlass(cornerRadius: 18)
                        }.buttonStyle(.plain).foregroundStyle(.primary)
                    }
                }

                Text("Account").font(.system(size: 13, weight: .bold)).foregroundStyle(.secondary)
                    .padding(.top, 6)
                if let u = store.user {
                    HStack {
                        Image(systemName: "person.crop.circle.fill").foregroundStyle(Color.accentColor)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(u.email).font(.system(size: 14, weight: .semibold)).lineLimit(1)
                            Text("Synced across web, Android & iOS").font(.system(size: 11)).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Button("Sign out") { store.signOut() }
                            .font(.system(size: 13, weight: .bold)).foregroundStyle(.red)
                    }
                    .padding(.horizontal, 14).padding(.vertical, 13)
                    .frame(maxWidth: .infinity).liquidGlass(cornerRadius: 18)
                } else {
                    Button { dismiss(); store.guest = false } label: {
                        HStack {
                            Image(systemName: "icloud.and.arrow.up")
                            Text("Sign in to sync your chats").fontWeight(.semibold)
                            Spacer()
                            Image(systemName: "chevron.right").font(.caption)
                        }
                        .padding(.horizontal, 14).padding(.vertical, 13)
                        .frame(maxWidth: .infinity).liquidGlass(cornerRadius: 18)
                    }.buttonStyle(.plain).foregroundStyle(.primary)
                }

                Spacer()
                Text("AskAI for iOS · Liquid Glass").font(.caption).foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .center)
            }
            .padding(.horizontal, 18).padding(.bottom, 20)
        }
    }
}
