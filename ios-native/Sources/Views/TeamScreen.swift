import SwiftUI

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
    @State private var events: [TeamEvent] = []
    @State private var draft = ""
    @State private var working = false

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                GlassIconButton(system: "chevron.left", action: back)
                Spacer()
                Text("Agents").font(.system(size: 17, weight: .bold))
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

            if events.isEmpty {
                VStack(spacing: 14) {
                    Spacer()
                    Text("🧭💻🎨🔎").font(.system(size: 34))
                    Text("The team room").font(.system(size: 22, weight: .bold, design: .rounded))
                    Text("Give your agents a task. The best-fit specialist picks it up and delivers.")
                        .font(.system(size: 13)).foregroundStyle(.secondary)
                        .multilineTextAlignment(.center).padding(.horizontal, 40)
                    Spacer()
                }
            } else {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 12) {
                            ForEach(events) { ev in
                                if ev.fromUser {
                                    HStack {
                                        Spacer(minLength: 50)
                                        Text(ev.text)
                                            .padding(.horizontal, 15).padding(.vertical, 11)
                                            .background(Color.primary, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                                            .foregroundStyle(Color(uiColor: .systemBackground))
                                    }
                                } else if let a = ev.agent {
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
                    .onChange(of: events.last?.text) { _, _ in
                        withAnimation { proxy.scrollTo("bottom", anchor: .bottom) }
                    }
                }
            }

            // Composer
            HStack(alignment: .bottom, spacing: 6) {
                TextField("Give the team a task…", text: $draft, axis: .vertical)
                    .font(.system(size: 16)).lineLimit(1...5)
                    .padding(.leading, 16).padding(.vertical, 13)
                Button {
                    let t = draft.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !t.isEmpty, !working else { return }
                    draft = ""
                    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                    Task { await run(t) }
                } label: {
                    Image(systemName: working ? "ellipsis" : "arrow.up")
                        .font(.system(size: 17, weight: .bold))
                        .foregroundStyle(Color(uiColor: .systemBackground))
                        .frame(width: 40, height: 40)
                        .background(Circle().fill(draft.isEmpty || working ? AnyShapeStyle(Color.secondary.opacity(0.4)) : AnyShapeStyle(Color.primary)))
                }
                .buttonStyle(.plain)
                .disabled(draft.isEmpty || working)
                .padding(.trailing, 6).padding(.bottom, 6)
            }
            .liquidGlass(cornerRadius: 28, interactive: true)
            .padding(.horizontal, 12).padding(.bottom, 8)
        }
    }

    /// Route to the best-fit agent, then stream their in-character answer.
    private func run(_ task: String) async {
        working = true
        events.append(TeamEvent(agent: nil, text: task, fromUser: true))

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

        var ev = TeamEvent(agent: picked, text: "")
        events.append(ev)
        let idx = events.count - 1

        let system = Message(role: .system, text:
            "You are \(picked.name), the \(picked.role) on the AskAI team. \(picked.persona) Speak in first person, do the task fully and concisely. No status updates, no filler. Use Markdown when helpful.")
        do {
            try await GroqClient.shared.stream(model: "openai/gpt-oss-120b",
                                               messages: [system, Message(role: .user, text: task)]) { token in
                ev.text += token
                if idx < events.count { events[idx] = ev }
            }
        } catch {
            ev.text = "(\(picked.name) couldn't respond right now.)"
            if idx < events.count { events[idx] = ev }
        }
        working = false
    }
}
