import SwiftUI
import PhotosUI

struct TeamAgent: Identifiable {
    let id: String
    let name: String
    let emoji: String
    let role: String
    let persona: String

    static let all: [TeamAgent] = [
        TeamAgent(id: "bob", name: "Bob", emoji: "🧭", role: "Team Lead",
                  persona: "A decisive coordinator. Concise and action-oriented."),
        TeamAgent(id: "ada", name: "Ada", emoji: "💻", role: "Engineer",
                  persona: "A world-class full-stack engineer. Complete, runnable code, no placeholders."),
        TeamAgent(id: "iris", name: "Iris", emoji: "🎨", role: "Designer",
                  persona: "A senior product designer with impeccable taste."),
        TeamAgent(id: "max", name: "Max", emoji: "🔎", role: "Researcher",
                  persona: "A sharp researcher who gathers facts and references."),
        TeamAgent(id: "vera", name: "Vera", emoji: "✍️", role: "Writer",
                  persona: "A brilliant copywriter and storyteller. No clichés, no filler."),
        TeamAgent(id: "leo", name: "Leo", emoji: "📣", role: "Marketer",
                  persona: "A growth marketer with concrete, actionable tactics."),
        TeamAgent(id: "nova", name: "Nova", emoji: "📊", role: "Analyst",
                  persona: "A rigorous data analyst. Clear takeaways, shows working."),
    ]
}

struct TeamEvent: Identifiable {
    let id = UUID()
    let agent: TeamAgent?
    var text: String
    var fromUser = false
}

struct TeamScreen: View {
    @EnvironmentObject var store: AppStore
    let back: () -> Void
    @State private var draft = ""
    @State private var working = false
    @State private var attachments: [String] = []
    @State private var showPhotos = false
    @State private var photoItems: [PhotosPickerItem] = []

    private func agent(_ id: String?) -> TeamAgent? { TeamAgent.all.first { $0.id == id } }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                GlassIconButton(system: "chevron.left", action: back)
                Spacer()
                Text(store.t("Agents")).font(.system(size: 17, weight: .bold))
                Spacer()
                HStack(spacing: -8) {
                    ForEach(TeamAgent.all.prefix(4)) { a in
                        Text(a.emoji).font(.system(size: 14))
                            .frame(width: 28, height: 28)
                            .background(Color.primary.opacity(0.06), in: Circle())
                            .overlay(Circle().strokeBorder(Color(uiColor: .systemBackground), lineWidth: 2))
                    }
                }
            }
            .padding(.horizontal, 14).padding(.top, 6).padding(.bottom, 8)

            if store.teamLog.isEmpty {
                VStack(spacing: 14) {
                    Spacer()
                    Text("🧭💻🎨🔎").font(.system(size: 34))
                    Text(store.t("The team room")).font(.system(size: 22, weight: .bold, design: .rounded))
                    Text(store.t("Give your agents a task. The best-fit specialist picks it up and delivers."))
                        .font(.system(size: 13)).foregroundStyle(.secondary)
                        .multilineTextAlignment(.center).padding(.horizontal, 40)
                    Spacer()
                }
            } else {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 12) {
                            ForEach(store.teamLog) { ev in
                                if ev.fromUser {
                                    HStack {
                                        Spacer(minLength: 50)
                                        Text(ev.text)
                                            .padding(.horizontal, 15).padding(.vertical, 11)
                                            .background(Color.primary, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                                            .foregroundStyle(Color(uiColor: .systemBackground))
                                    }
                                } else if let a = agent(ev.agentId) {
                                    HStack(alignment: .top, spacing: 10) {
                                        Text(a.emoji).font(.system(size: 18))
                                            .frame(width: 34, height: 34)
                                            .background(Color.primary.opacity(0.06), in: Circle())
                                        VStack(alignment: .leading, spacing: 3) {
                                            HStack(spacing: 6) {
                                                Text(a.name).font(.system(size: 13, weight: .bold))
                                                Text(a.role).font(.system(size: 11)).foregroundStyle(.secondary)
                                            }
                                            Text(LocalizedStringKey(ev.text.isEmpty ? "…" : ev.text))
                                                .font(.system(size: 15))
                                                .padding(.horizontal, 13).padding(.vertical, 10)
                                                .liquidGlass(cornerRadius: 18)
                                        }
                                        Spacer(minLength: 30)
                                    }
                                }
                            }
                        }
                        .padding(.horizontal, 16).padding(.vertical, 10)
                        .id("bottom")
                    }
                    .onChange(of: store.teamLog.last?.text) { _, _ in
                        withAnimation { proxy.scrollTo("bottom", anchor: .bottom) }
                    }
                }
            }

            // Attachment strip
            if !attachments.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(Array(attachments.enumerated()), id: \.offset) { i, dataURL in
                            ZStack(alignment: .topTrailing) {
                                if let img = UIImage.fromDataURL(dataURL) {
                                    Image(uiImage: img).resizable().scaledToFill()
                                        .frame(width: 54, height: 54)
                                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                                }
                                Button { attachments.remove(at: i) } label: {
                                    Image(systemName: "xmark.circle.fill").font(.system(size: 15))
                                        .foregroundStyle(.white, .black.opacity(0.6))
                                }.offset(x: 5, y: -5)
                            }
                        }
                    }.padding(.horizontal, 16).padding(.bottom, 2)
                }
            }

            // Composer
            HStack(alignment: .bottom, spacing: 6) {
                Button { showPhotos = true } label: {
                    Image(systemName: "plus").font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(.primary).frame(width: 36, height: 36)
                }.padding(.leading, 6).padding(.bottom, 5)

                TextField(store.t("Give the team a task…"), text: $draft, axis: .vertical)
                    .font(.system(size: 16)).lineLimit(1...5)
                    .padding(.vertical, 13)
                Button {
                    let t = draft.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard (!t.isEmpty || !attachments.isEmpty), !working else { return }
                    let imgs = attachments
                    draft = ""; attachments = []
                    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                    Task { await run(t.isEmpty ? "Look at this." : t, images: imgs) }
                } label: {
                    Image(systemName: working ? "ellipsis" : "arrow.up")
                        .font(.system(size: 17, weight: .bold))
                        .foregroundStyle(Color(uiColor: .systemBackground))
                        .frame(width: 40, height: 40)
                        .background(Circle().fill((draft.isEmpty && attachments.isEmpty) || working ? AnyShapeStyle(Color.secondary.opacity(0.4)) : AnyShapeStyle(Color.accentColor)))
                }
                .buttonStyle(.plain)
                .disabled((draft.isEmpty && attachments.isEmpty) || working)
                .padding(.trailing, 6).padding(.bottom, 6)
            }
            .liquidGlass(cornerRadius: 28, interactive: true)
            .padding(.horizontal, 12).padding(.bottom, 8)
        }
        .photosPicker(isPresented: $showPhotos, selection: $photoItems, maxSelectionCount: 4, matching: .images)
        .onChange(of: photoItems) { _, items in
            guard !items.isEmpty else { return }
            Task {
                for item in items {
                    if let data = try? await item.loadTransferable(type: Data.self),
                       let img = UIImage(data: data),
                       let jpeg = img.resized(maxSide: 1280).jpegData(compressionQuality: 0.7) {
                        attachments.append("data:image/jpeg;base64,\(jpeg.base64EncodedString())")
                    }
                }
                photoItems = []
            }
        }
    }

    /// Route to the best-fit agent, then stream their in-character answer.
    private func run(_ task: String, images: [String] = []) async {
        working = true
        store.teamLog.append(TeamLogEntry(agentId: nil, text: task, fromUser: true))
        store.saveTeamLog()

        // Pick the agent with a quick routing completion.
        var picked = TeamAgent.all[0]
        let roster = TeamAgent.all.map { "\($0.name) (\($0.role)): \($0.persona)" }.joined(separator: "\n")
        let routing = [
            Message(role: .system, text: "Pick the ONE best agent for the task. Team:\n\(roster)\nReply with ONLY the agent's name."),
            Message(role: .user, text: task),
        ]
        var routeOut = ""
        try? await GroqClient.shared.stream(model: "llama-3.3-70b-versatile", messages: routing) { routeOut += $0 }
        if let match = TeamAgent.all.first(where: { routeOut.lowercased().contains($0.name.lowercased()) }) {
            picked = match
        }

        let entry = TeamLogEntry(agentId: picked.id, text: "", fromUser: false)
        store.teamLog.append(entry)
        let idx = store.teamLog.count - 1

        var langNote = ""
        if let lang = Languages.instructionName(store.language) { langNote = " Always respond in \(lang)." }
        let system = Message(role: .system, text:
            "You are \(picked.name), the \(picked.role) on the AskAI team. \(picked.persona) Speak in first person, do the task fully and concisely. No status updates, no filler. Use Markdown when helpful.\(langNote)")
        let userMsg = Message(role: .user, text: task, attachments: images)
        let model = images.isEmpty ? "openai/gpt-oss-120b" : AIModel.visionModel.backend
        let provider: Provider = images.isEmpty ? .groq : AIModel.visionModel.provider
        do {
            try await GroqClient.shared.stream(model: model, provider: provider,
                                               messages: [system, userMsg]) { token in
                if idx < store.teamLog.count { store.teamLog[idx].text += token }
            }
        } catch {
            if idx < store.teamLog.count { store.teamLog[idx].text = "(\(picked.name) couldn't respond right now.)" }
        }
        store.saveTeamLog()
        working = false
    }
}
