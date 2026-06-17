import SwiftUI

// Home landing + Jobs + Apps — native SwiftUI ports of the web workspace.
// Home is navigation-only (uses the local store). Jobs/Apps persist to the
// SAME Firestore the web uses (over REST) so they sync across platforms.

// MARK: - Home landing

struct HomeScreen: View {
    @EnvironmentObject var store: AppStore
    let go: (AppScreen) -> Void
    let openMenu: () -> Void

    private struct Card: Identifiable { let id = UUID(); let title: String; let sub: String; let icon: String; let dest: AppScreen }
    private let cards: [Card] = [
        .init(title: "Agents", sub: "Your AI team", icon: "person.2", dest: .team),
        .init(title: "Jobs", sub: "Scheduled tasks", icon: "bolt", dest: .jobs),
        .init(title: "Friends", sub: "Chat, voice & video", icon: "person.2.wave.2", dest: .friends),
        .init(title: "Apps", sub: "Agents build for you", icon: "square.grid.2x2", dest: .apps),
    ]

    var body: some View {
        ZStack {
            GlassBackground()
            ScrollView {
                VStack(spacing: 16) {
                    HStack {
                        Button { openMenu() } label: { Image(systemName: "line.3.horizontal").font(.system(size: 18, weight: .semibold)).frame(width: 38, height: 38).liquidGlass(cornerRadius: 19) }.buttonStyle(.plain).foregroundStyle(.primary)
                        Spacer()
                        Text("AskAI").font(.system(size: 20, weight: .bold, design: .rounded))
                        Spacer()
                        Color.clear.frame(width: 38, height: 38)
                    }.padding(.horizontal, 16).padding(.top, 14)

                    VStack(spacing: 6) {
                        Image(systemName: "sparkles").font(.system(size: 30, weight: .semibold)).foregroundStyle(.primary).frame(width: 60, height: 60).liquidGlass(cornerRadius: 20)
                        Text("Welcome to AskAI").font(.system(size: 26, weight: .bold))
                        Text("Your AI workspace — chat, agents, and a team that works for you.").font(.callout).foregroundStyle(.secondary).multilineTextAlignment(.center).padding(.horizontal, 24)
                    }.padding(.top, 8)

                    Button { store.newChat(); go(.chat) } label: {
                        HStack { Image(systemName: "square.and.pencil"); Text("New chat with AskAI").fontWeight(.bold) }
                            .frame(maxWidth: .infinity).padding(.vertical, 16)
                            .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 18, style: .continuous)).foregroundStyle(.white)
                    }.buttonStyle(PressableButtonStyle()).padding(.horizontal, 16)

                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                        ForEach(cards) { c in
                            Button { go(c.dest) } label: {
                                VStack(alignment: .leading, spacing: 8) {
                                    Image(systemName: c.icon).font(.system(size: 20, weight: .semibold)).frame(width: 40, height: 40).background(Color.accentColor.opacity(0.16), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                                    Text(c.title).font(.system(size: 16, weight: .bold))
                                    Text(c.sub).font(.system(size: 12)).foregroundStyle(.secondary)
                                }.frame(maxWidth: .infinity, alignment: .leading).padding(14).liquidGlass(cornerRadius: 20)
                            }.buttonStyle(PressableButtonStyle()).foregroundStyle(.primary)
                        }
                    }.padding(.horizontal, 16)

                    if !store.sessions.isEmpty {
                        HStack { Text("Recent").font(.system(size: 12, weight: .bold)).foregroundStyle(.secondary); Spacer() }.padding(.horizontal, 20)
                        VStack(spacing: 8) {
                            ForEach(store.sessions.prefix(5)) { s in
                                Button { store.select(s.id); go(.chat) } label: {
                                    HStack { Image(systemName: "bubble.left").foregroundStyle(.secondary); Text(s.title).lineLimit(1); Spacer(); Image(systemName: "chevron.right").font(.system(size: 12)).foregroundStyle(.secondary) }
                                        .padding(.horizontal, 14).padding(.vertical, 12).frame(maxWidth: .infinity, alignment: .leading).liquidGlass(cornerRadius: 18)
                                }.buttonStyle(PressableButtonStyle()).foregroundStyle(.primary)
                            }
                        }.padding(.horizontal, 16)
                    }
                }.padding(.bottom, 30)
            }
        }
    }
}

// MARK: - Firestore-backed simple records

struct JobRecord: Identifiable { let id: String; var title: String; var prompt: String; var when: String }
struct AppRecord: Identifiable { let id: String; var title: String; var kind: String }

enum WorkspaceService {
    private static func s(_ any: Any?) -> String? { (any as? [String: Any])?["stringValue"] as? String }

    static func list(_ path: String, _ user: AuthUser) async -> [[String: Any]] {
        var req = URLRequest(url: URL(string: "\(FB.docBase)/\(path)?pageSize=80")!)
        req.setValue("Bearer \(user.idToken)", forHTTPHeaderField: "Authorization")
        let data = (try? await URLSession.shared.data(for: req))?.0 ?? Data()
        let obj = ((try? JSONSerialization.jsonObject(with: data)) as? [String: Any]) ?? [:]
        return (obj["documents"] as? [[String: Any]]) ?? []
    }

    static func jobs(_ user: AuthUser) async -> [JobRecord] {
        (await list("users/\(user.uid)/jobs", user)).compactMap { d in
            guard let name = d["name"] as? String, let f = d["fields"] as? [String: Any] else { return nil }
            let id = name.split(separator: "/").last.map(String.init) ?? UUID().uuidString
            return JobRecord(id: id, title: s(f["title"]) ?? "Job", prompt: s(f["prompt"]) ?? "", when: s(f["when"]) ?? "")
        }
    }
    static func addJob(_ user: AuthUser, _ j: JobRecord) async {
        var req = URLRequest(url: URL(string: "\(FB.docBase)/users/\(user.uid)/jobs")!)
        req.httpMethod = "POST"; req.setValue("Bearer \(user.idToken)", forHTTPHeaderField: "Authorization"); req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["fields": [
            "title": ["stringValue": j.title], "prompt": ["stringValue": j.prompt], "when": ["stringValue": j.when],
        ]])
        _ = try? await URLSession.shared.data(for: req)
    }

    static func apps(_ user: AuthUser) async -> [AppRecord] {
        (await list("users/\(user.uid)/agentApps", user)).compactMap { d in
            guard let name = d["name"] as? String, let f = d["fields"] as? [String: Any] else { return nil }
            let id = name.split(separator: "/").last.map(String.init) ?? UUID().uuidString
            return AppRecord(id: id, title: s(f["title"]) ?? "App", kind: s(f["kind"]) ?? "app")
        }
    }
}

// MARK: - Jobs

struct JobsScreen: View {
    @EnvironmentObject var store: AppStore
    let back: () -> Void
    @State private var jobs: [JobRecord] = []
    @State private var showAdd = false
    @State private var title = ""; @State private var prompt = ""; @State private var when = "tomorrow"

    var body: some View {
        ZStack {
            GlassBackground()
            VStack(spacing: 0) {
                HStack {
                    Button { back() } label: { Image(systemName: "chevron.left").font(.system(size: 17, weight: .semibold)) }.buttonStyle(.plain).foregroundStyle(.primary)
                    Text("Jobs").font(.system(size: 22, weight: .bold)); Spacer()
                    Button { showAdd = true } label: { Image(systemName: "plus").font(.system(size: 17, weight: .bold)).frame(width: 36, height: 36).background(Color.accentColor, in: Circle()).foregroundStyle(.white) }.buttonStyle(.plain)
                }.padding(.horizontal, 18).padding(.top, 16).padding(.bottom, 10)
                ScrollView {
                    VStack(spacing: 8) {
                        if jobs.isEmpty { Text("No jobs yet — tap + to schedule one.").font(.callout).foregroundStyle(.secondary).padding(.top, 30) }
                        ForEach(jobs) { j in
                            HStack {
                                Image(systemName: "bolt").foregroundStyle(.orange)
                                VStack(alignment: .leading, spacing: 2) { Text(j.title).font(.system(size: 15, weight: .semibold)); Text(j.prompt).font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(1) }
                                Spacer(); Text(j.when).font(.system(size: 12)).foregroundStyle(.secondary)
                            }.padding(.horizontal, 14).padding(.vertical, 12).frame(maxWidth: .infinity, alignment: .leading).liquidGlass(cornerRadius: 18)
                        }
                    }.padding(.horizontal, 16).padding(.bottom, 30)
                }
            }
        }
        .task { if let u = store.user { jobs = await WorkspaceService.jobs(u) } }
        .sheet(isPresented: $showAdd) {
            ZStack {
                GlassBackground()
                VStack(spacing: 12) {
                    Text("New job").font(.system(size: 20, weight: .bold)).padding(.top, 18)
                    TextField("Title", text: $title).padding(14).liquidGlass(cornerRadius: 14)
                    TextField("What should the agent do?", text: $prompt, axis: .vertical).padding(14).liquidGlass(cornerRadius: 14)
                    TextField("When (e.g. tomorrow, every morning)", text: $when).padding(14).liquidGlass(cornerRadius: 14)
                    Button {
                        Task {
                            if let u = store.user { await WorkspaceService.addJob(u, JobRecord(id: "", title: title, prompt: prompt, when: when)); jobs = await WorkspaceService.jobs(u) }
                            showAdd = false; title = ""; prompt = ""
                        }
                    } label: { Text("Schedule").fontWeight(.bold).frame(maxWidth: .infinity).padding(.vertical, 14).background(Color.accentColor, in: RoundedRectangle(cornerRadius: 16)).foregroundStyle(.white) }.buttonStyle(.plain).disabled(title.isEmpty)
                    Spacer()
                }.padding(.horizontal, 18)
            }.presentationDetents([.medium]).presentationBackground(.clear)
        }
    }
}

// MARK: - Apps

struct AppsScreen: View {
    @EnvironmentObject var store: AppStore
    let back: () -> Void
    @State private var apps: [AppRecord] = []

    var body: some View {
        ZStack {
            GlassBackground()
            VStack(spacing: 0) {
                HStack {
                    Button { back() } label: { Image(systemName: "chevron.left").font(.system(size: 17, weight: .semibold)) }.buttonStyle(.plain).foregroundStyle(.primary)
                    Text("Apps").font(.system(size: 22, weight: .bold)); Spacer()
                }.padding(.horizontal, 18).padding(.top, 16).padding(.bottom, 10)
                ScrollView {
                    VStack(spacing: 10) {
                        Text("Websites and apps your agents build for you.").font(.callout).foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .leading)
                        if apps.isEmpty { Text("No apps yet — ask an agent to build one in chat.").font(.callout).foregroundStyle(.secondary).padding(.top, 24) }
                        ForEach(apps) { a in
                            HStack {
                                Image(systemName: "square.grid.2x2").foregroundStyle(.purple)
                                VStack(alignment: .leading, spacing: 2) { Text(a.title).font(.system(size: 15, weight: .semibold)); Text(a.kind.capitalized).font(.system(size: 12)).foregroundStyle(.secondary) }
                                Spacer(); Image(systemName: "chevron.right").font(.system(size: 12)).foregroundStyle(.secondary)
                            }.padding(.horizontal, 14).padding(.vertical, 12).frame(maxWidth: .infinity, alignment: .leading).liquidGlass(cornerRadius: 18)
                        }
                    }.padding(.horizontal, 16).padding(.bottom, 30)
                }
            }
        }
        .task { if let u = store.user { apps = await WorkspaceService.apps(u) } }
    }
}
