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

                    // Personalization
                    SectionLabel("Personalization")
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Response length").font(.system(size: 12, weight: .semibold)).foregroundStyle(.secondary)
                        ChipRow(options: ["concise", "balanced", "detailed"], selected: store.verbosity) { store.setVerbosity($0) }
                        Text("Tone").font(.system(size: 12, weight: .semibold)).foregroundStyle(.secondary)
                        ChipRow(options: ["professional", "friendly", "playful", "direct"], selected: store.tone) { store.setTone($0) }
                        Text("Custom instructions").font(.system(size: 12, weight: .semibold)).foregroundStyle(.secondary)
                        TextField("e.g. Always answer in short bullet points", text: Binding(
                            get: { store.customInstructions },
                            set: { store.setCustomInstructions($0) }
                        ), axis: .vertical)
                        .lineLimit(2...4)
                        .font(.system(size: 14))
                        .padding(.horizontal, 14).padding(.vertical, 12)
                        .liquidGlass(cornerRadius: 16)
                    }
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .liquidGlass(cornerRadius: 20)

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
                        ForEach(AIModel.selectable) { m in
                            Button { store.setModel(m) } label: {
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

struct ChipRow: View {
    let options: [String]
    let selected: String
    let pick: (String) -> Void
    var body: some View {
        HStack(spacing: 6) {
            ForEach(options, id: \.self) { o in
                Button {
                    pick(o)
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                } label: {
                    Text(o.capitalized)
                        .font(.system(size: 12, weight: .semibold))
                        .padding(.horizontal, 11).padding(.vertical, 7)
                        .background(
                            selected == o ? AnyShapeStyle(Color.primary) : AnyShapeStyle(Color.primary.opacity(0.06)),
                            in: Capsule()
                        )
                        .foregroundStyle(selected == o ? Color(uiColor: .systemBackground) : .primary)
                }.buttonStyle(.plain)
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
