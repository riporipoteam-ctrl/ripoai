import SwiftUI

/// Live OpenClaw browser preview — pops up while Agent mode works. Shows the
/// page screenshot, a browser chrome with the current URL, and a live trace of
/// every action (search / click / read) with an animated cursor.
struct AgentBrowserPanel: View {
    @ObservedObject var agent: OpenClawAgent
    let onClose: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            // Grabber + title
            HStack(spacing: 8) {
                Image(systemName: "pawprint.fill").font(.system(size: 15, weight: .bold))
                    .foregroundStyle(.orange)
                Text("OpenClaw").font(.system(size: 16, weight: .heavy))
                if agent.running {
                    ProgressView().scaleEffect(0.7).padding(.leading, 2)
                } else {
                    Image(systemName: "checkmark.seal.fill").foregroundStyle(.green).font(.system(size: 14))
                }
                Spacer()
                Button { onClose() } label: {
                    Image(systemName: "xmark").font(.system(size: 14, weight: .bold))
                        .foregroundStyle(.secondary).frame(width: 32, height: 32)
                        .background(Color.primary.opacity(0.06), in: Circle())
                }
            }
            .padding(.horizontal, 16).padding(.top, 14).padding(.bottom, 10)

            // Browser chrome
            HStack(spacing: 7) {
                Circle().fill(.red.opacity(0.85)).frame(width: 10, height: 10)
                Circle().fill(.yellow.opacity(0.85)).frame(width: 10, height: 10)
                Circle().fill(.green.opacity(0.85)).frame(width: 10, height: 10)
                HStack(spacing: 6) {
                    Image(systemName: agent.running ? "arrow.triangle.2.circlepath" : "globe")
                        .font(.system(size: 11, weight: .bold)).foregroundStyle(.secondary)
                        .symbolEffect(.pulse, options: .repeating, isActive: agent.running)
                    Text(agent.currentURL ?? "OpenClaw browser")
                        .font(.system(size: 12, weight: .semibold)).lineLimit(1).truncationMode(.middle)
                        .foregroundStyle(.secondary)
                }
                .padding(.horizontal, 11).padding(.vertical, 6)
                .background(Color.primary.opacity(0.05), in: Capsule())
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, 14).padding(.bottom, 10)

            // Viewport (live screenshot)
            ZStack {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Color.primary.opacity(0.04))
                if let shot = agent.screenshot, let url = URL(string: shot) {
                    AsyncImage(url: url, transaction: .init(animation: .easeInOut)) { phase in
                        switch phase {
                        case .success(let img):
                            img.resizable().scaledToFill()
                                .transition(.opacity)
                        default:
                            VStack(spacing: 10) {
                                ProgressView()
                                Text(agent.statusLine).font(.system(size: 12)).foregroundStyle(.secondary)
                            }
                        }
                    }
                    .id(shot)
                } else {
                    VStack(spacing: 10) {
                        Image(systemName: "pawprint.fill").font(.system(size: 28)).foregroundStyle(.orange)
                            .symbolEffect(.pulse, options: .repeating)
                        Text(agent.statusLine).font(.system(size: 13, weight: .medium)).foregroundStyle(.secondary)
                    }
                }
            }
            .aspectRatio(16.0/10.0, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(.primary.opacity(0.08)))
            .padding(.horizontal, 14)

            // Action trace
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 7) {
                        ForEach(agent.steps) { s in
                            HStack(spacing: 9) {
                                Image(systemName: icon(s.kind))
                                    .font(.system(size: 12, weight: .bold))
                                    .foregroundStyle(color(s.kind))
                                    .frame(width: 20)
                                Text(s.label).font(.system(size: 13))
                                    .foregroundStyle(.primary).lineLimit(1)
                                Spacer()
                            }
                            .id(s.id)
                        }
                    }
                    .padding(.horizontal, 16).padding(.vertical, 12)
                }
                .onChange(of: agent.steps.count) { _, _ in
                    if let last = agent.steps.last { withAnimation { proxy.scrollTo(last.id, anchor: .bottom) } }
                }
            }
            .frame(maxHeight: 150)
        }
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 26, style: .continuous).strokeBorder(.primary.opacity(0.08)))
        .padding(.horizontal, 10)
        .shadow(color: .black.opacity(0.18), radius: 24, y: 10)
    }

    private func icon(_ k: AgentStep.Kind) -> String {
        switch k {
        case .start: return "play.fill"
        case .search: return "magnifyingglass"
        case .type: return "keyboard"
        case .click: return "cursorarrow.click"
        case .read: return "doc.text"
        case .screenshot: return "camera.viewfinder"
        case .done: return "checkmark.circle.fill"
        case .error: return "exclamationmark.triangle.fill"
        }
    }
    private func color(_ k: AgentStep.Kind) -> Color {
        switch k {
        case .done: return .green
        case .error: return .orange
        case .search, .type: return .blue
        case .click, .read: return .purple
        default: return .secondary
        }
    }
}
