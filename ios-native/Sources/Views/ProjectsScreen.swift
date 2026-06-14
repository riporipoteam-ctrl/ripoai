import SwiftUI
import WebKit

struct ProjectsScreen: View {
    @EnvironmentObject var store: AppStore
    let back: () -> Void
    @State private var opened: Project?
    @State private var creating = false
    @State private var newName = ""

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                GlassIconButton(system: "chevron.left", action: back)
                Spacer()
                Text(store.t("Projects")).font(.system(size: 17, weight: .bold))
                Spacer()
                GlassIconButton(system: "plus") { newName = ""; creating = true }
            }
            .padding(.horizontal, 14).padding(.top, 6).padding(.bottom, 8)

            if store.projects.isEmpty {
                VStack(spacing: 12) {
                    Spacer()
                    Image(systemName: "folder.badge.plus").font(.system(size: 40)).foregroundStyle(.secondary)
                    Text(store.t("No projects yet")).font(.system(size: 17, weight: .bold))
                    Text(store.t("Create a project to start building. It's saved on your device."))
                        .font(.system(size: 13)).foregroundStyle(.secondary)
                        .multilineTextAlignment(.center).padding(.horizontal, 40)
                    Button {
                        newName = ""; creating = true
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    } label: {
                        Label(store.t("New project"), systemImage: "plus")
                            .font(.system(size: 15, weight: .bold))
                            .padding(.horizontal, 22).padding(.vertical, 12)
                            .background(Color.primary, in: Capsule())
                            .foregroundStyle(Color(uiColor: .systemBackground))
                    }.buttonStyle(.plain)
                    Spacer()
                }
            } else {
                ScrollView {
                    VStack(spacing: 8) {
                        ForEach(store.projects) { p in
                            Button { opened = p } label: {
                                HStack {
                                    Image(systemName: "folder.fill").foregroundStyle(.secondary)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(p.name).font(.system(size: 15, weight: .semibold)).lineLimit(1)
                                        Text("\(p.files.count) file\(p.files.count == 1 ? "" : "s")")
                                            .font(.system(size: 11)).foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    Image(systemName: "chevron.right").font(.system(size: 12)).foregroundStyle(.secondary)
                                }
                                .padding(.horizontal, 14).padding(.vertical, 13)
                                .frame(maxWidth: .infinity)
                                .liquidGlass(cornerRadius: 18)
                            }
                            .buttonStyle(PressableButtonStyle()).foregroundStyle(.primary)
                            .contextMenu {
                                Button(role: .destructive) { store.deleteProject(p.id) } label: {
                                    Label(store.t("Delete"), systemImage: "trash")
                                }
                            }
                        }
                    }
                    .padding(.horizontal, 16).padding(.bottom, 24)
                }
            }
        }
        .sheet(item: $opened) { p in
            ProjectFilesSheet(projectID: p.id).environmentObject(store)
                .presentationDetents([.large])
        }
        .alert(store.t("New project"), isPresented: $creating) {
            TextField(store.t("Project name"), text: $newName)
            Button(store.t("Create")) {
                let p = store.createProject(name: newName)
                newName = ""
                UINotificationFeedbackGenerator().notificationOccurred(.success)
                opened = p
            }
            Button(store.t("Cancel"), role: .cancel) { newName = "" }
        } message: {
            Text(store.t("Creates a starter web project saved on your device."))
        }
    }
}

/// Build with AskAI (chat), browse/edit files, and live-preview the project.
private struct ProjectFilesSheet: View {
    @EnvironmentObject var store: AppStore
    let projectID: UUID
    @State private var tab = 0
    @State private var openFile: String?
    @State private var draft = ""
    @FocusState private var composerFocused: Bool

    private var project: Project? { store.projects.first { $0.id == projectID } }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("", selection: $tab) {
                    Text(store.t("Build")).tag(0); Text(store.t("Files")).tag(1); Text(store.t("Preview")).tag(2)
                }
                .pickerStyle(.segmented).padding(.horizontal, 14).padding(.top, 8)

                if let project {
                    switch tab {
                    case 0: buildChat(project)
                    case 1: filesList(project)
                    default: ProjectPreview(html: Self.bundle(project))
                    }
                } else {
                    Spacer(); Text(store.t("Project not found.")).foregroundStyle(.secondary); Spacer()
                }
            }
            .navigationTitle(project?.name ?? store.t("Project"))
            .navigationBarTitleDisplayMode(.inline)
            .sheet(item: Binding(get: { openFile.map { FileID(path: $0) } },
                                 set: { openFile = $0?.path })) { fid in
                FileEditor(projectID: projectID, path: fid.path).environmentObject(store)
            }
        }
    }

    // MARK: Build chat
    @ViewBuilder private func buildChat(_ project: Project) -> some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 12) {
                        if project.chat.isEmpty {
                            VStack(spacing: 8) {
                                Image(systemName: "hammer.fill").font(.system(size: 30)).foregroundStyle(.orange)
                                Text(store.t("Tell AskAI what to build")).font(.system(size: 16, weight: .bold))
                                Text(store.t("e.g. “A landing page for my coffee shop with a hero, menu and contact form.”"))
                                    .font(.system(size: 12)).foregroundStyle(.secondary)
                                    .multilineTextAlignment(.center).padding(.horizontal, 30)
                            }.frame(maxWidth: .infinity).padding(.top, 40)
                        }
                        ForEach(project.chat) { msg in
                            if msg.role == .user {
                                HStack { Spacer(minLength: 40)
                                    Text(msg.text).padding(.horizontal, 14).padding(.vertical, 10)
                                        .background(Color.primary, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                                        .foregroundStyle(Color(uiColor: .systemBackground))
                                }
                            } else {
                                MarkdownText(text: msg.text.isEmpty ? "…" : msg.text)
                                    .padding(.horizontal, 13).padding(.vertical, 10)
                                    .liquidGlass(cornerRadius: 16)
                            }
                        }.id("end")
                    }.padding(16)
                }
                .onChange(of: project.chat.last?.text) { _, _ in withAnimation { proxy.scrollTo("end", anchor: .bottom) } }
            }
            HStack(alignment: .bottom, spacing: 8) {
                TextField(store.t("Describe what to build or change…"), text: $draft, axis: .vertical)
                    .focused($composerFocused).font(.system(size: 16)).lineLimit(1...5).padding(.vertical, 11)
                Button {
                    let t = draft.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !t.isEmpty, !store.projectBuilding else { return }
                    draft = ""; composerFocused = false
                    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                    store.buildInProject(projectID, prompt: t)
                } label: {
                    Image(systemName: store.projectBuilding ? "ellipsis" : "arrow.up")
                        .font(.system(size: 17, weight: .bold)).foregroundStyle(Color(uiColor: .systemBackground))
                        .frame(width: 40, height: 40)
                        .background(Circle().fill(draft.isEmpty || store.projectBuilding ? AnyShapeStyle(.secondary.opacity(0.4)) : AnyShapeStyle(Color.accentColor)))
                }.buttonStyle(.plain).disabled(draft.isEmpty || store.projectBuilding).padding(.bottom, 5)
            }
            .liquidGlass(cornerRadius: 24, interactive: true)
            .padding(.horizontal, 12).padding(.bottom, 8).padding(.leading, 4)
        }
    }

    @ViewBuilder private func filesList(_ project: Project) -> some View {
        List {
            ForEach(project.files.keys.sorted(), id: \.self) { path in
                Button { openFile = path } label: {
                    HStack {
                        Image(systemName: "doc.text").foregroundStyle(.secondary)
                        Text(path).font(.system(size: 14, weight: .medium, design: .monospaced))
                        Spacer()
                        Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
                    }
                }.foregroundStyle(.primary)
            }
        }.listStyle(.plain)
    }

    /// Inline a project's css/js into index.html for a self-contained preview.
    static func bundle(_ project: Project) -> String {
        var html = project.files["index.html"] ?? project.files.first(where: { $0.key.hasSuffix(".html") })?.value ?? "<h2 style='font-family:system-ui;padding:2rem'>No index.html yet — ask AskAI to build one.</h2>"
        for (path, code) in project.files {
            if path.hasSuffix(".css") {
                html = html.replacingOccurrences(of: "<link rel=\"stylesheet\" href=\"\(path)\">", with: "<style>\(code)</style>")
                html = html.replacingOccurrences(of: "<link rel=\"stylesheet\" href=\"/\(path)\">", with: "<style>\(code)</style>")
            } else if path.hasSuffix(".js") {
                html = html.replacingOccurrences(of: "<script src=\"\(path)\"></script>", with: "<script>\(code)</script>")
                html = html.replacingOccurrences(of: "<script src=\"/\(path)\"></script>", with: "<script>\(code)</script>")
            }
        }
        return html
    }
}

/// Live in-app preview of the built site.
struct ProjectPreview: UIViewRepresentable {
    let html: String
    func makeUIView(context: Context) -> WKWebView {
        let v = WKWebView()
        v.isOpaque = false
        return v
    }
    func updateUIView(_ uiView: WKWebView, context: Context) {
        uiView.loadHTMLString(html, baseURL: nil)
    }
}

private struct FileEditor: View {
    @EnvironmentObject var store: AppStore
    @Environment(\.dismiss) private var dismiss
    let projectID: UUID
    let path: String
    @State private var text = ""
    @State private var loaded = false

    var body: some View {
        NavigationStack {
            TextEditor(text: $text)
                .font(.system(size: 13, design: .monospaced))
                .padding(8)
                .navigationTitle(path)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button(store.t("Save")) {
                            store.updateProjectFile(projectID, path: path, content: text)
                            UINotificationFeedbackGenerator().notificationOccurred(.success)
                            dismiss()
                        }.fontWeight(.bold)
                    }
                }
                .onAppear {
                    if !loaded {
                        text = store.projects.first { $0.id == projectID }?.files[path] ?? ""
                        loaded = true
                    }
                }
        }
        .presentationDetents([.large])
    }
}

private struct FileID: Identifiable {
    let path: String
    var id: String { path }
}
