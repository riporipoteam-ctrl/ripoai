import Foundation

/// A live browser action in an OpenClaw run.
struct AgentStep: Identifiable, Equatable {
    enum Kind: String { case start, search, type, click, read, screenshot, done, error }
    let id = UUID()
    var kind: Kind
    var label: String
    var url: String?
    var screenshot: String?   // thum.io image URL
    var title: String?
}

/// OpenClaw — AskAI's real, backend-free browsing agent. It decides each step
/// with the model, then actually searches the web (DuckDuckGo), opens and reads
/// pages (Jina reader), and shows a live screenshot (thum.io) of every page it
/// lands on. Mirrors the web app's agent engine.
@MainActor
final class OpenClawAgent: ObservableObject {
    @Published var steps: [AgentStep] = []
    @Published var screenshot: String?
    @Published var currentURL: String?
    @Published var currentTitle: String?
    @Published var statusLine: String = "Launching OpenClaw…"
    @Published var running = false
    @Published var summary: String = ""
    @Published var sources: [(title: String, url: String)] = []

    private let maxSteps = 10

    private func emit(_ kind: AgentStep.Kind, _ label: String, url: String? = nil) {
        var step = AgentStep(kind: kind, label: label, url: url ?? currentURL,
                             screenshot: screenshot, title: currentTitle)
        step.screenshot = screenshot
        steps.append(step)
        statusLine = label
    }

    private func shotURL(_ url: String) -> String {
        "https://image.thum.io/get/width/1200/crop/800/noanimate/\(url)"
    }

    private func host(_ url: String) -> String {
        URL(string: url)?.host?.replacingOccurrences(of: "www.", with: "") ?? String(url.prefix(40))
    }

    /// Read a page as clean text via the Jina reader, with an allorigins fallback.
    private func readPage(_ url: String) async -> (title: String, text: String)? {
        if let txt = await get("https://r.jina.ai/\(url)"), !txt.isEmpty {
            let title = firstMatch(txt, #"^Title:\s*(.+)$"#) ?? host(url)
            return (title, String(txt.prefix(7000)))
        }
        if let html = await get("https://api.allorigins.win/raw?url=\(url.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? url)") {
            let title = firstMatch(html, #"<title[^>]*>([^<]+)</title>"#) ?? host(url)
            let text = html
                .replacingOccurrences(of: #"<script[\s\S]*?</script>"#, with: " ", options: .regularExpression)
                .replacingOccurrences(of: #"<style[\s\S]*?</style>"#, with: " ", options: .regularExpression)
                .replacingOccurrences(of: #"<[^>]+>"#, with: " ", options: .regularExpression)
                .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
                .trimmingCharacters(in: .whitespacesAndNewlines)
            return (title, String(text.prefix(7000)))
        }
        return nil
    }

    /// Search DuckDuckGo Lite (read through Jina) and extract organic links.
    private func search(_ query: String) async -> (serp: String, text: String, links: [(title: String, url: String)]) {
        let q = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? query
        let serp = "https://lite.duckduckgo.com/lite/?q=\(q)"
        let page = await readPage(serp)
        let text = page?.text ?? ""
        var links: [(String, String)] = []
        var seen = Set<String>()
        let re = try? NSRegularExpression(pattern: #"\[([^\]]{3,120})\]\((https?://[^\s)]+)\)"#)
        let ns = text as NSString
        re?.enumerateMatches(in: text, range: NSRange(location: 0, length: ns.length)) { m, _, stop in
            guard let m, links.count < 10 else { stop.pointee = true; return }
            var url = ns.substring(with: m.range(at: 2))
            if let uddg = firstMatch(url, #"[?&]uddg=([^&]+)"#)?.removingPercentEncoding { url = uddg }
            let h = host(url)
            if h.contains("duckduckgo.com") || h.contains("duck.co") || seen.contains(url) { return }
            seen.insert(url)
            links.append((ns.substring(with: m.range(at: 1)).trimmingCharacters(in: .whitespaces), url))
        }
        return (serp, String(text.prefix(3500)), links.map { (title: $0.0, url: $0.1) })
    }

    /// Run the full agent loop for a task, returning the final answer text.
    func run(_ task: String) async -> String {
        running = true
        emit(.start, "Launching OpenClaw")

        var visited: [(title: String, url: String, excerpt: String)] = []
        var serpText = ""
        var pageText = ""
        var links: [(title: String, url: String)] = []

        let decideSystem = """
        You are OpenClaw, AskAI's browser agent. Decide the SINGLE next action. \
        Reply with ONLY compact JSON, no prose:
        {"action":"search","query":"..."} — search the web
        {"action":"open","url":"https://..."} — open one of the available links or a known URL
        {"action":"done","answer":"...complete answer with concrete findings and source URLs..."}
        Be thorough: open and read several pages and verify across 2-3 sources before "done".
        """

        for step in 0..<maxSteps {
            let context = """
            TASK: \(task)
            \(visited.isEmpty ? "No pages read yet." : "PAGES READ:\n" + visited.enumerated().map { "\($0.offset + 1). \($0.element.title) — \($0.element.url)\n\($0.element.excerpt.prefix(700))" }.joined(separator: "\n\n"))
            \(links.isEmpty ? "" : "LINKS TO OPEN:\n" + links.enumerated().map { "\($0.offset + 1). \($0.element.title) — \($0.element.url)" }.joined(separator: "\n"))
            \(currentURL != nil ? "CURRENT PAGE: \(currentTitle ?? "") (\(currentURL!))\n\(pageText.prefix(2200))" : "")
            Step \(step + 1) of \(maxSteps). \(step >= maxSteps - 2 ? "Budget nearly used — finish with action \"done\" and your full findings." : "Keep researching until thorough.")
            """
            var decision: [String: Any]? = nil
            if let out = try? await GroqClient.shared.complete(
                model: "llama-3.3-70b-versatile",
                messages: [Message(role: .system, text: decideSystem), Message(role: .user, text: context)]),
               let json = extractJSON(out) {
                decision = json
            }
            let action = (decision?["action"] as? String)
                ?? (step == 0 ? "search" : "done")

            // Force more research if it tries to finish too early.
            var act = action
            if act == "done", visited.count < 2, step < maxSteps - 1 {
                act = (links.first?.url ?? visited.first?.url) != nil ? "open" : "search"
            }

            if act == "done" {
                var answer = decision?["answer"] as? String ?? ""
                if answer.isEmpty, !visited.isEmpty {
                    answer = (try? await GroqClient.shared.complete(
                        model: "llama-3.3-70b-versatile",
                        messages: [
                            Message(role: .system, text: "Write the final answer from the pages OpenClaw read. Be concrete (names, numbers, prices) and cite source URLs inline as Markdown links."),
                            Message(role: .user, text: "TASK: \(task)\n\nPAGES:\n" + visited.map { "## \($0.title) (\($0.url))\n\($0.excerpt)" }.joined(separator: "\n\n")),
                        ])) ?? ""
                }
                emit(.done, "Task complete")
                summary = answer
                sources = visited.map { (title: $0.title, url: $0.url) }
                running = false
                return answer
            }

            if act == "search" {
                let query = (decision?["query"] as? String) ?? task
                emit(.type, "Typing “\(query.prefix(48))” into search")
                let r = await search(query)
                currentURL = r.serp
                currentTitle = "Search: \(query.prefix(40))"
                screenshot = shotURL(r.serp)
                serpText = r.text; pageText = r.text; links = r.links
                _ = serpText
                emit(.search, "Found \(r.links.count) results")
                continue
            }

            if act == "open", let url = (decision?["url"] as? String) ?? links.first?.url {
                emit(.click, "Clicking \(host(url))", url: url)
                if let page = await readPage(url) {
                    currentURL = url
                    currentTitle = page.title
                    screenshot = shotURL(url)
                    pageText = page.text
                    visited.append((page.title, url, String(page.text.prefix(1800))))
                    emit(.read, "Reading \(page.title.prefix(56))", url: url)
                } else {
                    emit(.error, "\(host(url)) didn’t load — trying another", url: url)
                    links.removeAll { $0.url == url }
                }
                continue
            }
        }

        // Budget exhausted — summarize what we have.
        var answer = ""
        if !visited.isEmpty {
            answer = (try? await GroqClient.shared.complete(
                model: "llama-3.3-70b-versatile",
                messages: [
                    Message(role: .system, text: "Write the final answer from the pages OpenClaw read. Be concrete and cite source URLs inline as Markdown links."),
                    Message(role: .user, text: "TASK: \(task)\n\nPAGES:\n" + visited.map { "## \($0.title) (\($0.url))\n\($0.excerpt)" }.joined(separator: "\n\n")),
                ])) ?? ""
        }
        emit(.done, "Browser session finished")
        summary = answer
        sources = visited.map { (title: $0.title, url: $0.url) }
        running = false
        return answer
    }

    // MARK: helpers
    private func get(_ url: String) async -> String? {
        guard let u = URL(string: url) else { return nil }
        var req = URLRequest(url: u)
        req.timeoutInterval = 15
        req.setValue("Mozilla/5.0 AskAI OpenClaw", forHTTPHeaderField: "User-Agent")
        guard let (data, resp) = try? await URLSession.shared.data(for: req),
              (resp as? HTTPURLResponse)?.statusCode == 200 else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private func firstMatch(_ s: String, _ pattern: String) -> String? {
        guard let re = try? NSRegularExpression(pattern: pattern, options: [.anchorsMatchLines, .caseInsensitive]) else { return nil }
        let ns = s as NSString
        guard let m = re.firstMatch(in: s, range: NSRange(location: 0, length: ns.length)), m.numberOfRanges > 1 else { return nil }
        return ns.substring(with: m.range(at: 1)).trimmingCharacters(in: .whitespaces)
    }

    private func extractJSON(_ s: String) -> [String: Any]? {
        guard let start = s.firstIndex(of: "{"), let end = s.lastIndex(of: "}") else { return nil }
        let slice = String(s[start...end])
        guard let data = slice.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return obj
    }
}
