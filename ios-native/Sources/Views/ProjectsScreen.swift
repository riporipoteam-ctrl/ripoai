import SwiftUI

struct ProjectItem: Identifiable {
    let id: String
    let name: String
    let description: String
    let files: [String: String]
}

struct ProjectsScreen: View {
    @EnvironmentObject var store: AppStore
    let back: () -> Void
    @State private var projects: [ProjectItem] = []
    @State private var loading = false
    @State private var opened: ProjectItem?

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                GlassIconButton(system: "chevron.left", action: back)
                Spacer()
                Text("Projects").font(.system(size: 17, weight: .bold))
                Spacer()
                Color.clear.frame(width: 42, height: 42)
            }
            .padding(.horizontal, 14).padding(.top, 6).padding(.bottom, 8)

            if store.user == nil {
                VStack(spacing: 12) {
                    Spacer()
                    Image(systemName: "folder").font(.system(size: 36)).foregroundStyle(.secondary)
                    Text("Sign in to see your projects")
                        .font(.system(size: 16, weight: .semibold))
                    Text("Projects you build on the website appear here.")
                        .font(.system(size: 13)).foregroundStyle(.secondary)
                    Button("Sign in") { store.guest = false }
                        .font(.system(size: 14, weight: .bold))
                        .padding(.horizontal, 22).padding(.vertical, 11)
                        .background(Color.primary, in: Capsule())
                        .foregroundStyle(Color(uiColor: .systemBackground))
                    Spacer()
                }
            } else if loading {
                Spacer(); ProgressView("Loading projects…"); Spacer()
            } else if projects.isEmpty {
                VStack(spacing: 10) {
                    Spacer()
                    Image(systemName: "folder").font(.system(size: 36)).foregroundStyle(.secondary)
                    Text("No projects yet").font(.system(size: 16, weight: .semibold))
                    Text("Create one on the website — it'll show up here.")
                        .font(.system(size: 13)).foregroundStyle(.secondary)
                    Spacer()
                }
            } else {
                ScrollView {
                    VStack(spacing: 8) {
                        ForEach(projects) { p in
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
                            }.buttonStyle(.plain).foregroundStyle(.primary)
                        }
                    }
                    .padding(.horizontal, 16).padding(.bottom, 24)
                }
            }
        }
        .task { await loadProjects() }
        .sheet(item: $opened) { p in
            ProjectFilesSheet(project: p)
                .presentationDetents([.large])
        }
    }

    private func loadProjects() async {
        guard let u = store.user else { return }
        loading = true
        defer { loading = false }
        guard let url = URL(string: "\(FB.docBase)/users/\(u.uid)/projects?pageSize=50") else { return }
        var req = URLRequest(url: url)
        req.setValue("Bearer \(u.idToken)", forHTTPHeaderField: "Authorization")
        guard let (data, _) = try? await URLSession.shared.data(for: req),
              let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let docs = obj["documents"] as? [[String: Any]] else { return }
        projects = docs.compactMap { doc in
            guard let name = doc["name"] as? String,
                  let f = doc["fields"] as? [String: Any] else { return nil }
            let id = name.split(separator: "/").last.map(String.init) ?? UUID().uuidString
            let title = ((f["name"] as? [String: Any])?["stringValue"] as? String) ?? "Project"
            let desc = ((f["description"] as? [String: Any])?["stringValue"] as? String) ?? ""
            var files: [String: String] = [:]
            if let fm = ((f["files"] as? [String: Any])?["mapValue"] as? [String: Any])?["fields"] as? [String: Any] {
                for (path, v) in fm {
                    if let code = (v as? [String: Any])?["stringValue"] as? String { files[path] = code }
                }
            }
            return ProjectItem(id: id, name: title, description: desc, files: files)
        }
    }
}

private struct ProjectFilesSheet: View {
    let project: ProjectItem
    @State private var openFile: String?

    var body: some View {
        ZStack {
            GlassBackground()
            VStack(alignment: .leading, spacing: 0) {
                Text(project.name).font(.system(size: 20, weight: .bold, design: .rounded))
                    .padding(.horizontal, 18).padding(.top, 20).padding(.bottom, 10)
                ScrollView {
                    VStack(spacing: 6) {
                        ForEach(project.files.keys.sorted(), id: \.self) { path in
                            Button { openFile = path } label: {
                                HStack {
                                    Image(systemName: "doc.text").foregroundStyle(.secondary)
                                    Text(path).font(.system(size: 14, weight: .medium, design: .monospaced)).lineLimit(1)
                                    Spacer()
                                }
                                .padding(.horizontal, 14).padding(.vertical, 11)
                                .frame(maxWidth: .infinity)
                                .liquidGlass(cornerRadius: 14)
                            }.buttonStyle(.plain).foregroundStyle(.primary)
                        }
                    }
                    .padding(.horizontal, 16).padding(.bottom, 24)
                }
            }
        }
        .sheet(item: Binding(
            get: { openFile.map { FileID(path: $0) } },
            set: { openFile = $0?.path }
        )) { fid in
            ScrollView {
                Text(project.files[fid.path] ?? "")
                    .font(.system(size: 12, design: .monospaced))
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(16)
            }
            .presentationDetents([.large])
        }
    }
}

private struct FileID: Identifiable {
    let path: String
    var id: String { path }
}
