import SwiftUI

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
                            .buttonStyle(.plain).foregroundStyle(.primary)
                            .contextMenu {
                                Button(role: .destructive) { store.deleteProject(p.id) } label: {
                                    Label("Delete", systemImage: "trash")
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
        .alert("New project", isPresented: $creating) {
            TextField("Project name", text: $newName)
            Button("Create") {
                let p = store.createProject(name: newName)
                newName = ""
                UINotificationFeedbackGenerator().notificationOccurred(.success)
                opened = p
            }
            Button("Cancel", role: .cancel) { newName = "" }
        } message: {
            Text("Creates a starter web project saved on your device.")
        }
    }
}

/// View + edit a project's files. Edits save straight back to the store.
private struct ProjectFilesSheet: View {
    @EnvironmentObject var store: AppStore
    let projectID: UUID
    @State private var openFile: String?

    private var project: Project? { store.projects.first { $0.id == projectID } }

    var body: some View {
        NavigationStack {
            Group {
                if let project {
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
                    }
                    .listStyle(.plain)
                } else {
                    Text("Project not found.").foregroundStyle(.secondary)
                }
            }
            .navigationTitle(project?.name ?? "Project")
            .navigationBarTitleDisplayMode(.inline)
            .sheet(item: Binding(get: { openFile.map { FileID(path: $0) } },
                                 set: { openFile = $0?.path })) { fid in
                FileEditor(projectID: projectID, path: fid.path).environmentObject(store)
            }
        }
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
                        Button("Save") {
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
