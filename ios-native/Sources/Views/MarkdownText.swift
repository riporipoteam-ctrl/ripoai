import SwiftUI

/// Lightweight block-level Markdown renderer: headings, bullet/numbered lists,
/// and inline markdown (bold/italic/`code`/links — links are tappable).
struct MarkdownText: View {
    let text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                blockView(block)
            }
        }
    }

    private var blocks: [String] {
        text.replacingOccurrences(of: "\r", with: "").components(separatedBy: "\n")
            .reduce(into: [String]()) { acc, line in
                if line.trimmingCharacters(in: .whitespaces).isEmpty {
                    if acc.last != "" { acc.append("") }
                } else {
                    acc.append(line)
                }
            }
    }

    @ViewBuilder private func blockView(_ line: String) -> some View {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        if trimmed.isEmpty {
            Spacer().frame(height: 2)
        } else if trimmed.hasPrefix("### ") {
            inline(String(trimmed.dropFirst(4))).font(.system(size: 16, weight: .bold))
        } else if trimmed.hasPrefix("## ") {
            inline(String(trimmed.dropFirst(3))).font(.system(size: 17, weight: .bold))
        } else if trimmed.hasPrefix("# ") {
            inline(String(trimmed.dropFirst(2))).font(.system(size: 19, weight: .bold))
        } else if trimmed.hasPrefix("- ") || trimmed.hasPrefix("* ") {
            HStack(alignment: .top, spacing: 7) {
                Text("•").font(.system(size: 15, weight: .bold))
                inline(String(trimmed.dropFirst(2))).font(.system(size: 15.5))
            }
        } else if let r = trimmed.range(of: #"^\d+\. "#, options: .regularExpression) {
            HStack(alignment: .top, spacing: 7) {
                Text(String(trimmed[..<r.upperBound]).trimmingCharacters(in: .whitespaces))
                    .font(.system(size: 15.5, weight: .semibold))
                inline(String(trimmed[r.upperBound...])).font(.system(size: 15.5))
            }
        } else if trimmed.hasPrefix("```") {
            EmptyView() // fence markers — code body renders as plain lines
        } else {
            inline(trimmed).font(.system(size: 16))
        }
    }

    /// Inline markdown via AttributedString — makes [links](url) tappable.
    private func inline(_ s: String) -> Text {
        if let attr = try? AttributedString(
            markdown: s,
            options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)
        ) {
            return Text(attr)
        }
        return Text(s)
    }
}
