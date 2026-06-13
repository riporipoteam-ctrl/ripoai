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
    @State private var openAgent: CustomAgent?
    @State private var editAgent: CustomAgent?
    @State private var meetingMode = false

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

            // Roster of your created agents — tap to open their room.
            if !store.agents.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 14) {
                        ForEach(store.agents) { a in
                            Button { openAgent = a } label: {
                                VStack(spacing: 4) {
                                    AgentAvatar(agent: a, size: 52)
                                    Text(a.name).font(.system(size: 11, weight: .semibold)).lineLimit(1)
                                }.frame(width: 64)
                            }.buttonStyle(.plain).foregroundStyle(.primary)
                            .contextMenu {
                                Button { editAgent = a } label: { Label("Edit", systemImage: "pencil") }
                                Button(role: .destructive) { store.deleteAgent(a.id) } label: { Label("Delete", systemImage: "trash") }
                            }
                        }
                    }.padding(.horizontal, 16).padding(.bottom, 8)
                }
            }

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
                Button {
                    meetingMode.toggle()
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                } label: {
                    Image(systemName: meetingMode ? "person.3.fill" : "person.3")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(meetingMode ? Color.accentColor : .primary)
                        .frame(width: 34, height: 34)
                }.padding(.leading, 6).padding(.bottom, 5)

                TextField(meetingMode ? "Topic for the team meeting…" : "Give a task — or “make an agent that…”", text: $draft, axis: .vertical)
                    .font(.system(size: 16)).lineLimit(1...5)
                    .padding(.vertical, 13)
                Button {
                    let t = draft.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard (!t.isEmpty || !attachments.isEmpty), !working, !store.creatingAgent else { return }
                    let imgs = attachments
                    draft = ""; attachments = []
                    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                    if meetingMode && !t.isEmpty {
                        Task { await runMeeting(t) }
                    } else if imgs.isEmpty && store.looksLikeAgentRequest(t) {
                        Task { if let a = await store.createAgent(from: t) { openAgent = a } }
                    } else {
                        Task { await run(t.isEmpty ? "Look at this." : t, images: imgs) }
                    }
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
        .overlay {
            if store.creatingAgent {
                AgentCreationOverlay(status: store.agentCreationStatus)
            }
        }
        .sheet(item: $openAgent) { a in
            AgentRoomView(agentID: a.id).environmentObject(store)
        }
        .sheet(item: $editAgent) { a in
            AgentEditView(agent: a).environmentObject(store)
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

    /// A real team MEETING: several agents discuss the task in turns, each
    /// reacting to what teammates just said, then a lead wraps with next steps.
    private func runMeeting(_ topic: String) async {
        working = true
        store.teamLog.append(TeamLogEntry(agentId: nil, text: "📋 Team meeting: \(topic)", fromUser: true))
        store.saveTeamLog()

        // Pick the most relevant specialists to attend.
        let roster = TeamAgent.all.map { "\($0.id) = \($0.name) (\($0.role))" }.joined(separator: "\n")
        var picks: [TeamAgent] = []
        if let out = try? await GroqClient.shared.complete(
            model: "llama-3.3-70b-versatile",
            messages: [
                Message(role: .system, text: "Pick the 3 best agents for a meeting on the task. Team:\n\(roster)\nReply with ONLY their ids separated by commas."),
                Message(role: .user, text: topic),
            ]) {
            let ids = out.lowercased().split(whereSeparator: { ",； ".contains($0) }).map(String.init)
            picks = ids.compactMap { id in TeamAgent.all.first { $0.id == id } }
        }
        if picks.count < 2 { picks = Array(TeamAgent.all.prefix(3)) }
        picks = Array(picks.prefix(3))

        var langNote = ""
        if let lang = Languages.instructionName(store.language) { langNote = " Always respond in \(lang)." }

        var transcript = "TASK: \(topic)\n"
        for a in picks {
            let entry = TeamLogEntry(agentId: a.id, text: "", fromUser: false)
            store.teamLog.append(entry)
            let idx = store.teamLog.count - 1
            let sys = Message(role: .system, text:
                "You are \(a.name), the \(a.role). \(a.persona) You're in a live team meeting. Read the discussion so far and add YOUR concrete contribution in 2-4 sentences — build on or respectfully push back on teammates, don't repeat them, and stay in character.\(langNote)")
            let usr = Message(role: .user, text: "\(transcript)\nNow \(a.name), give your take and any concrete suggestion.")
            var out = ""
            do {
                try await GroqClient.shared.stream(model: "openai/gpt-oss-120b", messages: [sys, usr]) { tok in
                    out += tok
                    if idx < store.teamLog.count { store.teamLog[idx].text = out }
                }
            } catch {
                if idx < store.teamLog.count { store.teamLog[idx].text = "(stepped out of the meeting)" }
            }
            transcript += "\n\(a.name): \(out)\n"
        }

        // Lead wraps up with an action plan.
        if let lead = picks.first {
            let entry = TeamLogEntry(agentId: lead.id, text: "", fromUser: false)
            store.teamLog.append(entry)
            let idx = store.teamLog.count - 1
            let sys = Message(role: .system, text: "You are \(lead.name), chairing the meeting. Summarize the decisions and give a short numbered action plan with who-does-what.\(langNote)")
            var out = ""
            try? await GroqClient.shared.stream(model: "openai/gpt-oss-120b",
                                                messages: [sys, Message(role: .user, text: transcript)]) { tok in
                out += tok
                if idx < store.teamLog.count { store.teamLog[idx].text = out }
            }
        }
        store.saveTeamLog()
        if store.notifyOnComplete { NotificationManager.shared.taskDone("AskAI", "Your team finished their meeting.") }
        working = false
    }
}

// MARK: - Agent avatar

struct AgentAvatar: View {
    let agent: CustomAgent
    var size: CGFloat = 44
    var body: some View {
        Group {
            if let a = agent.avatar, a.hasPrefix("data:"), let img = UIImage.fromDataURL(a) {
                Image(uiImage: img).resizable().scaledToFill()
            } else if let a = agent.avatar, let url = URL(string: a) {
                AsyncImage(url: url) { phase in
                    if let img = phase.image { img.resizable().scaledToFill() }
                    else { fallback }
                }
            } else { fallback }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay(Circle().strokeBorder(Color.primary.opacity(0.1), lineWidth: 1))
    }
    private var fallback: some View {
        ZStack {
            Circle().fill(Color.accentColor.opacity(0.22))
            Text(String(agent.name.prefix(1))).font(.system(size: size * 0.42, weight: .bold)).foregroundStyle(Color.accentColor)
        }
    }
}

// MARK: - Creation overlay (cool animation while AskAI builds the agent)

struct AgentCreationOverlay: View {
    let status: String
    @State private var pulse = false
    var body: some View {
        ZStack {
            Color.black.opacity(0.55).ignoresSafeArea()
            VStack(spacing: 18) {
                ZStack {
                    ForEach(0..<3) { i in
                        Circle().stroke(Color.accentColor.opacity(0.5), lineWidth: 2)
                            .frame(width: 90 + CGFloat(i) * 26, height: 90 + CGFloat(i) * 26)
                            .scaleEffect(pulse ? 1.1 : 0.9).opacity(pulse ? 0.2 : 0.7)
                            .animation(.easeInOut(duration: 1.2).repeatForever().delay(Double(i) * 0.2), value: pulse)
                    }
                    Image(systemName: "sparkles").font(.system(size: 34, weight: .bold)).foregroundStyle(.white)
                        .symbolEffect(.variableColor.iterative, options: .repeating)
                }
                Text(status.isEmpty ? "Creating your agent…" : status)
                    .font(.system(size: 15, weight: .semibold)).foregroundStyle(.white)
                    .multilineTextAlignment(.center)
            }
            .padding(34)
        }
        .onAppear { pulse = true }
        .transition(.opacity)
    }
}

// MARK: - Agent room (chat with one agent)

struct AgentRoomView: View {
    @EnvironmentObject var store: AppStore
    @Environment(\.dismiss) private var dismiss
    let agentID: UUID
    @State private var draft = ""
    @State private var showProfile = false

    private var agent: CustomAgent? { store.agents.first { $0.id == agentID } }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if let agent {
                    Button { showProfile = true } label: {
                        HStack(spacing: 10) {
                            AgentAvatar(agent: agent, size: 40)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(agent.name).font(.system(size: 15, weight: .bold)).foregroundStyle(.primary)
                                Text(store.agentReplying ? "typing…" : agent.role)
                                    .font(.system(size: 11)).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Image(systemName: "info.circle").foregroundStyle(.secondary)
                        }.padding(.horizontal, 16).padding(.vertical, 8)
                    }.buttonStyle(.plain)
                    Divider()

                    ScrollViewReader { proxy in
                        ScrollView {
                            LazyVStack(alignment: .leading, spacing: 12) {
                                ForEach(agent.chat) { m in
                                    if m.role == .user {
                                        HStack { Spacer(minLength: 40)
                                            Text(m.text).padding(.horizontal, 14).padding(.vertical, 10)
                                                .background(Color.primary, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                                                .foregroundStyle(Color(uiColor: .systemBackground)) }
                                    } else {
                                        MarkdownText(text: m.text.isEmpty ? "…" : m.text)
                                            .padding(.horizontal, 13).padding(.vertical, 10).liquidGlass(cornerRadius: 16)
                                    }
                                }.id("end")
                            }.padding(16)
                        }
                        .onChange(of: agent.chat.last?.text) { _, _ in withAnimation { proxy.scrollTo("end", anchor: .bottom) } }
                    }

                    HStack(alignment: .bottom, spacing: 8) {
                        TextField("Message \(agent.name)…", text: $draft, axis: .vertical)
                            .font(.system(size: 16)).lineLimit(1...5).padding(.vertical, 11).padding(.leading, 6)
                        Button {
                            let t = draft.trimmingCharacters(in: .whitespacesAndNewlines)
                            guard !t.isEmpty, !store.agentReplying else { return }
                            draft = ""; UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                            store.messageAgent(agentID, text: t)
                        } label: {
                            Image(systemName: store.agentReplying ? "ellipsis" : "arrow.up")
                                .font(.system(size: 17, weight: .bold)).foregroundStyle(Color(uiColor: .systemBackground))
                                .frame(width: 40, height: 40)
                                .background(Circle().fill(draft.isEmpty || store.agentReplying ? AnyShapeStyle(.secondary.opacity(0.4)) : AnyShapeStyle(Color.accentColor)))
                        }.buttonStyle(.plain).disabled(draft.isEmpty || store.agentReplying).padding(.trailing, 6).padding(.bottom, 5)
                    }
                    .liquidGlass(cornerRadius: 26, interactive: true).padding(.horizontal, 12).padding(.bottom, 8)
                } else {
                    Spacer(); Text("Agent not found.").foregroundStyle(.secondary); Spacer()
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } } }
            .sheet(isPresented: $showProfile) {
                if let agent { AgentEditView(agent: agent).environmentObject(store) }
            }
        }
    }
}

// MARK: - Agent profile / edit

struct AgentEditView: View {
    @EnvironmentObject var store: AppStore
    @Environment(\.dismiss) private var dismiss
    @State var agent: CustomAgent
    @State private var skillsText = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack { Spacer(); AgentAvatar(agent: agent, size: 96); Spacer() }
                        .listRowBackground(Color.clear)
                }
                Section("Name") { TextField("Name", text: $agent.name) }
                Section("Role") { TextField("Role", text: $agent.role) }
                Section("Personality & how it works") {
                    TextField("Persona", text: $agent.persona, axis: .vertical).lineLimit(3...8)
                }
                Section("Skills (comma-separated)") {
                    TextField("research, coding, writing", text: $skillsText, axis: .vertical).lineLimit(1...4)
                }
                Section { Toggle("Can browse the web", isOn: $agent.canBrowse) }
            }
            .navigationTitle("Agent profile")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear { skillsText = agent.skills.joined(separator: ", ") }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Save") {
                        agent.skills = skillsText.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
                        store.updateAgent(agent)
                        UINotificationFeedbackGenerator().notificationOccurred(.success)
                        dismiss()
                    }.fontWeight(.bold)
                }
            }
        }
    }
}
