import SwiftUI

struct SettingsScreen: View {
    @EnvironmentObject var store: AppStore
    let back: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                GlassIconButton(system: "chevron.left", action: back)
                Spacer()
                Text("Settings").font(.system(size: 17, weight: .bold))
                Spacer()
                Color.clear.frame(width: 42, height: 42)
            }
            .padding(.horizontal, 14).padding(.top, 6).padding(.bottom, 8)

            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    // Account
                    SectionLabel("Account")
                    if let u = store.user {
                        HStack {
                            Image(systemName: "person.crop.circle.fill").font(.title2)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(u.email).font(.system(size: 14, weight: .semibold)).lineLimit(1)
                                Text("Synced across web, Android & iOS").font(.system(size: 11)).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Button("Sign out") { store.signOut() }
                                .font(.system(size: 13, weight: .bold)).foregroundStyle(.red)
                        }
                        .padding(14).frame(maxWidth: .infinity).liquidGlass(cornerRadius: 18)
                    } else {
                        Button { store.guest = false } label: {
                            HStack {
                                Image(systemName: "icloud.and.arrow.up")
                                Text("Sign in to sync your chats").fontWeight(.semibold)
                                Spacer()
                                Image(systemName: "chevron.right").font(.caption)
                            }
                            .padding(14).frame(maxWidth: .infinity).liquidGlass(cornerRadius: 18)
                        }.buttonStyle(.plain).foregroundStyle(.primary)
                    }

                    // Appearance
                    SectionLabel("Appearance")
                    HStack(spacing: 8) {
                        ForEach(["system", "light", "dark"], id: \.self) { v in
                            Button {
                                store.setAppearance(v)
                                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                            } label: {
                                Text(v.capitalized)
                                    .font(.system(size: 14, weight: .semibold))
                                    .frame(maxWidth: .infinity).padding(.vertical, 11)
                                    .background(
                                        store.appearance == v
                                        ? AnyShapeStyle(Color.primary)
                                        : AnyShapeStyle(Color.primary.opacity(0.05)),
                                        in: RoundedRectangle(cornerRadius: 14, style: .continuous)
                                    )
                                    .foregroundStyle(store.appearance == v ? Color(uiColor: .systemBackground) : .primary)
                            }.buttonStyle(.plain)
                        }
                    }

                    // Default model
                    SectionLabel("Model")
                    VStack(spacing: 8) {
                        ForEach(AIModel.all) { m in
                            Button { store.model = m } label: {
                                HStack {
                                    VStack(alignment: .leading, spacing: 1) {
                                        HStack(spacing: 6) {
                                            Text(m.name).font(.system(size: 15, weight: .semibold))
                                            if let b = m.badge {
                                                Text(b).font(.system(size: 9, weight: .heavy))
                                                    .padding(.horizontal, 6).padding(.vertical, 2)
                                                    .background(Color.primary.opacity(0.08), in: Capsule())
                                            }
                                        }
                                        Text(m.tagline).font(.system(size: 11)).foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    if store.model.id == m.id {
                                        Image(systemName: "checkmark.circle.fill")
                                    }
                                }
                                .padding(.horizontal, 14).padding(.vertical, 12)
                                .frame(maxWidth: .infinity)
                                .liquidGlass(cornerRadius: 18)
                            }.buttonStyle(.plain).foregroundStyle(.primary)
                        }
                    }

                    Text("AskAI for iOS · Native Liquid Glass")
                        .font(.caption).foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity).padding(.top, 8)
                }
                .padding(.horizontal, 16).padding(.bottom, 30)
            }
        }
    }
}

struct SectionLabel: View {
    let text: String
    init(_ t: String) { text = t }
    var body: some View {
        Text(text.uppercased())
            .font(.system(size: 11, weight: .bold))
            .foregroundStyle(.secondary)
            .padding(.horizontal, 4)
    }
}
