import Foundation

/// Real, backend-free web search used to ground answers. Searches DuckDuckGo,
/// reads the top results via the Jina reader, and returns compact context plus
/// sources — so AskAI actually searches instead of relying on a tool that may
/// silently do nothing.
enum WebSearch {
    struct Result { let context: String; let sources: [(title: String, url: String)] }

    static func run(_ query: String, maxPages: Int = 3) async -> Result? {
        let links = await search(query)
        guard !links.isEmpty else { return nil }
        var blocks: [String] = []
        var sources: [(title: String, url: String)] = []
        // Read the top few results in parallel for speed.
        await withTaskGroup(of: (Int, (title: String, text: String)?).self) { group in
            for (i, l) in links.prefix(maxPages).enumerated() {
                group.addTask { (i, await readPage(l.url)) }
            }
            var collected: [(Int, String, String, String)] = []
            for await (i, page) in group {
                if let page, !page.text.isEmpty {
                    collected.append((i, page.title, links[i].url, page.text))
                }
            }
            for c in collected.sorted(by: { $0.0 < $1.0 }) {
                blocks.append("## \(c.1) — \(c.2)\n\(String(c.3.prefix(2200)))")
                sources.append((title: c.1, url: c.2))
            }
        }
        guard !blocks.isEmpty else { return nil }
        let context = "LIVE WEB SEARCH RESULTS for \"\(query)\" (today is \(Self.today)):\n\n" + blocks.joined(separator: "\n\n")
        return Result(context: context, sources: sources)
    }

    private static var today: String {
        let f = DateFormatter(); f.dateStyle = .long; return f.string(from: Date())
    }

    /// DuckDuckGo Lite (read through Jina) → organic links.
    private static func search(_ query: String) async -> [(title: String, url: String)] {
        let q = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? query
        guard let page = await readPage("https://lite.duckduckgo.com/lite/?q=\(q)") else { return [] }
        var links: [(String, String)] = []
        var seen = Set<String>()
        let re = try? NSRegularExpression(pattern: #"\[([^\]]{3,120})\]\((https?://[^\s)]+)\)"#)
        let ns = page.text as NSString
        re?.enumerateMatches(in: page.text, range: NSRange(location: 0, length: ns.length)) { m, _, stop in
            guard let m, links.count < 8 else { stop.pointee = true; return }
            var url = ns.substring(with: m.range(at: 2))
            if let r = url.range(of: #"[?&]uddg=([^&]+)"#, options: .regularExpression) {
                let enc = String(url[r]).replacingOccurrences(of: #"[?&]uddg="#, with: "", options: .regularExpression)
                if let dec = enc.removingPercentEncoding { url = dec }
            }
            let host = URL(string: url)?.host ?? ""
            if host.contains("duckduckgo.com") || host.contains("duck.co") || seen.contains(url) { return }
            seen.insert(url)
            links.append((ns.substring(with: m.range(at: 1)).trimmingCharacters(in: .whitespaces), url))
        }
        return links.map { (title: $0.0, url: $0.1) }
    }

    /// Read a page as clean text via Jina, with an allorigins fallback.
    private static func readPage(_ url: String) async -> (title: String, text: String)? {
        if let txt = await get("https://r.jina.ai/\(url)"), !txt.isEmpty {
            let title = firstMatch(txt, #"^Title:\s*(.+)$"#) ?? (URL(string: url)?.host ?? "Result")
            return (title, String(txt.prefix(6000)))
        }
        let enc = url.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? url
        if let html = await get("https://api.allorigins.win/raw?url=\(enc)") {
            let title = firstMatch(html, #"<title[^>]*>([^<]+)</title>"#) ?? (URL(string: url)?.host ?? "Result")
            let text = html
                .replacingOccurrences(of: #"<script[\s\S]*?</script>"#, with: " ", options: .regularExpression)
                .replacingOccurrences(of: #"<style[\s\S]*?</style>"#, with: " ", options: .regularExpression)
                .replacingOccurrences(of: #"<[^>]+>"#, with: " ", options: .regularExpression)
                .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
                .trimmingCharacters(in: .whitespacesAndNewlines)
            return (title, String(text.prefix(6000)))
        }
        return nil
    }

    private static func get(_ url: String) async -> String? {
        guard let u = URL(string: url) else { return nil }
        var req = URLRequest(url: u); req.timeoutInterval = 14
        req.setValue("Mozilla/5.0 AskAI", forHTTPHeaderField: "User-Agent")
        guard let (data, resp) = try? await URLSession.shared.data(for: req),
              (resp as? HTTPURLResponse)?.statusCode == 200 else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private static func firstMatch(_ s: String, _ pattern: String) -> String? {
        guard let re = try? NSRegularExpression(pattern: pattern, options: [.anchorsMatchLines, .caseInsensitive]) else { return nil }
        let ns = s as NSString
        guard let m = re.firstMatch(in: s, range: NSRange(location: 0, length: ns.length)), m.numberOfRanges > 1 else { return nil }
        return ns.substring(with: m.range(at: 1)).trimmingCharacters(in: .whitespaces)
    }
}
