import SwiftUI

struct SettingsScreen: View {
    @EnvironmentObject var store: AppStore
    let back: () -> Void
    @State private var showLanguagePicker = false

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                GlassIconButton(system: "chevron.left", action: back)
                Spacer()
                Text(store.t("Settings")).font(.system(size: 17, weight: .bold))
                Spacer()
                Color.clear.frame(width: 42, height: 42)
            }
            .padding(.horizontal, 14).padding(.top, 6).padding(.bottom, 8)

            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    // Account
                    SectionLabel(store.t("Account"))
                    if let u = store.user {
                        HStack {
                            Image(systemName: "person.crop.circle.fill").font(.title2)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(u.email).font(.system(size: 14, weight: .semibold)).lineLimit(1)
                                Text(store.t("Synced across web, Android & iOS")).font(.system(size: 11)).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Button(store.t("Sign out")) { store.signOut() }
                                .font(.system(size: 13, weight: .bold)).foregroundStyle(.red)
                        }
                        .padding(14).frame(maxWidth: .infinity).liquidGlass(cornerRadius: 18)
                    } else {
                        Button { store.guest = false } label: {
                            HStack {
                                Image(systemName: "icloud.and.arrow.up")
                                Text(store.t("Sign in to sync your chats")).fontWeight(.semibold)
                                Spacer()
                                Image(systemName: "chevron.right").font(.caption)
                            }
                            .padding(14).frame(maxWidth: .infinity).liquidGlass(cornerRadius: 18)
                        }.buttonStyle(.plain).foregroundStyle(.primary)
                    }

                    // Personalization
                    SectionLabel(store.t("Personalization"))
                    VStack(alignment: .leading, spacing: 10) {
                        Text(store.t("Response length")).font(.system(size: 12, weight: .semibold)).foregroundStyle(.secondary)
                        ChipRow(options: ["concise", "balanced", "detailed"], selected: store.verbosity) { store.setVerbosity($0) }
                        Text(store.t("Tone")).font(.system(size: 12, weight: .semibold)).foregroundStyle(.secondary)
                        ChipRow(options: ["professional", "friendly", "playful", "direct"], selected: store.tone) { store.setTone($0) }
                        Text(store.t("Custom instructions")).font(.system(size: 12, weight: .semibold)).foregroundStyle(.secondary)
                        TextField(store.t("e.g. Always answer in short bullet points"), text: Binding(
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

                    // Language
                    SectionLabel(store.t("Language"))
                    VStack(spacing: 12) {
                        Button { showLanguagePicker = true } label: {
                            HStack {
                                Image(systemName: "globe").foregroundStyle(.secondary)
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(store.t("App language")).font(.system(size: 15, weight: .semibold))
                                    Text(Languages.displayName(store.language))
                                        .font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(1)
                                }
                                Spacer()
                                Image(systemName: "chevron.right").font(.system(size: 12)).foregroundStyle(.secondary)
                            }
                        }.buttonStyle(.plain).foregroundStyle(.primary)
                        Text(store.t("AskAI replies in this language. “Auto” follows your device language."))
                            .font(.system(size: 11)).foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .padding(14).frame(maxWidth: .infinity, alignment: .leading)
                    .liquidGlass(cornerRadius: 20)

                    // Web access
                    SectionLabel(store.t("Web access"))
                    VStack(spacing: 12) {
                        Toggle(store.t("Auto web search"), isOn: Binding(
                            get: { store.autoWebSearch }, set: { store.setAutoWebSearch($0) }))
                        Text(store.t("AskAI automatically searches the live web when a question needs current info (news, prices, weather, scores…)."))
                            .font(.system(size: 11)).foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .tint(Color.accentColor)
                    .padding(14).frame(maxWidth: .infinity, alignment: .leading)
                    .liquidGlass(cornerRadius: 20)

                    // Notifications & personalization
                    SectionLabel(store.t("Notifications & Personalization"))
                    VStack(spacing: 12) {
                        Toggle(store.t("Notify when a task finishes"), isOn: Binding(
                            get: { store.notifyOnComplete }, set: { store.setNotifyOnComplete($0) }))
                        Divider()
                        VStack(alignment: .leading, spacing: 8) {
                            Text(store.t("AI check-ins")).font(.system(size: 13, weight: .semibold)).foregroundStyle(.secondary)
                            ChipRow(options: ["off", "daily", "weekly", "monthly"], selected: store.aiCheckins) { store.setCheckins($0) }
                            Text(store.t("AskAI sends a friendly nudge to help with your chats."))
                                .font(.system(size: 11)).foregroundStyle(.secondary)
                        }
                        Divider()
                        Toggle(store.t("Use my location for personalization"), isOn: Binding(
                            get: { store.locationEnabled }, set: { store.setLocationEnabled($0) }))
                    }
                    .tint(Color.accentColor)
                    .padding(14).frame(maxWidth: .infinity, alignment: .leading)
                    .liquidGlass(cornerRadius: 20)

                    // Appearance
                    SectionLabel(store.t("Appearance"))
                    HStack(spacing: 8) {
                        ForEach(["system", "light", "dark"], id: \.self) { v in
                            Button {
                                store.setAppearance(v)
                                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                            } label: {
                                Text(store.t(v.capitalized))
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
                    SectionLabel(store.t("Model"))
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
        .sheet(isPresented: $showLanguagePicker) {
            LanguagePicker(selected: store.language) { store.setLanguage($0) }
                .environmentObject(store)
                .presentationDetents([.large])
        }
    }
}

/// Searchable language picker with an Auto (device) option + 180+ languages.
struct LanguagePicker: View {
    @EnvironmentObject var store: AppStore
    let selected: String
    let pick: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    private var filtered: [AppLanguage] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        if q.isEmpty { return Languages.all }
        return Languages.all.filter {
            $0.name.lowercased().contains(q) || $0.native.lowercased().contains(q) || $0.code.contains(q)
        }
    }

    var body: some View {
        NavigationStack {
            List {
                if query.trimmingCharacters(in: .whitespaces).isEmpty {
                    row(code: "auto", title: store.t("Auto"), subtitle: Languages.displayName("auto"))
                }
                ForEach(filtered) { lang in
                    row(code: lang.code, title: lang.native, subtitle: lang.name)
                }
            }
            .listStyle(.plain)
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: store.t("Search 180+ languages"))
            .navigationTitle(store.t("Language"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(store.t("Done")) { dismiss() }
                }
            }
        }
    }

    private func row(code: String, title: String, subtitle: String) -> some View {
        Button {
            pick(code)
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            dismiss()
        } label: {
            HStack {
                VStack(alignment: .leading, spacing: 1) {
                    Text(title).font(.system(size: 16, weight: .medium)).foregroundStyle(.primary)
                    Text(subtitle).font(.system(size: 12)).foregroundStyle(.secondary)
                }
                Spacer()
                if selected == code {
                    Image(systemName: "checkmark").foregroundStyle(Color.accentColor).fontWeight(.bold)
                }
            }
        }
    }
}

struct ChipRow: View {
    @EnvironmentObject var store: AppStore
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
                    Text(store.t(o.capitalized))
                        .font(.system(size: 12, weight: .semibold))
                        .padding(.horizontal, 11).padding(.vertical, 7)
                        .background(
                            selected == o ? AnyShapeStyle(Color.primary) : AnyShapeStyle(Color.primary.opacity(0.06)),
                            in: Capsule()
                        )
                        .foregroundStyle(selected == o ? Color(uiColor: .systemBackground) : .primary)
                }.buttonStyle(PressableButtonStyle())
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
