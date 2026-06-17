import SwiftUI
import WebKit

// Live preview + code for an agent-built app — the native equivalent of the
// web's Sandpack preview. Renders the app's HTML in a WKWebView and shows the
// source.

struct AppWebView: UIViewRepresentable {
    let html: String
    func makeUIView(context: Context) -> WKWebView {
        let v = WKWebView()
        v.isOpaque = false
        v.backgroundColor = .clear
        v.scrollView.backgroundColor = .clear
        return v
    }
    func updateUIView(_ v: WKWebView, context: Context) {
        v.loadHTMLString(html.isEmpty ? "<html><body style='font-family:-apple-system;padding:24px;color:#888'>No preview yet.</body></html>" : html, baseURL: nil)
    }
}

struct AppDetailView: View {
    let title: String
    let html: String
    let back: () -> Void
    @State private var tab = 0

    var body: some View {
        ZStack {
            GlassBackground()
            VStack(spacing: 0) {
                HStack {
                    Button { back() } label: { Image(systemName: "chevron.left").font(.system(size: 17, weight: .semibold)) }.buttonStyle(.plain).foregroundStyle(.primary)
                    Text(title).font(.system(size: 18, weight: .bold)).lineLimit(1)
                    Spacer()
                }.padding(.horizontal, 16).padding(.top, 14).padding(.bottom, 8)

                Picker("", selection: $tab) {
                    Text("Preview").tag(0); Text("Code").tag(1)
                }.pickerStyle(.segmented).padding(.horizontal, 16).padding(.bottom, 8)

                if tab == 0 {
                    AppWebView(html: html)
                        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(Color.primary.opacity(0.08)))
                        .padding(16)
                } else {
                    ScrollView([.vertical, .horizontal]) {
                        Text(html.isEmpty ? "// No source yet" : html)
                            .font(.system(size: 12, design: .monospaced))
                            .textSelection(.enabled)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(16)
                    }
                    .liquidGlass(cornerRadius: 16)
                    .padding(16)
                }
            }
        }
    }
}
