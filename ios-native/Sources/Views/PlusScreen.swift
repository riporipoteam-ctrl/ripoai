import SwiftUI

struct PlusScreen: View {
    let back: () -> Void
    @State private var appear = false

    private let features = [
        ("infinity", "Higher limits", "More messages, images and uploads every day"),
        ("bolt.fill", "Priority models", "First access to the most powerful AskAI tiers"),
        ("photo.stack", "More image generations", "Create far more images per day"),
        ("person.2.fill", "Full agent team", "Unlimited agent runs and longer tasks"),
        ("sparkles", "Early features", "New modes land for AskAI+ first"),
    ]

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                GlassIconButton(system: "chevron.left", action: back)
                Spacer(); Text("AskAI+").font(.system(size: 17, weight: .bold)); Spacer()
                Color.clear.frame(width: 42, height: 42)
            }
            .padding(.horizontal, 14).padding(.top, 6).padding(.bottom, 8)

            ScrollView {
                VStack(spacing: 18) {
                    VStack(spacing: 8) {
                        Image(systemName: "crown.fill")
                            .font(.system(size: 34, weight: .bold))
                            .foregroundStyle(.primary)
                            .frame(width: 84, height: 84)
                            .liquidGlass(cornerRadius: 26)
                        Text("AskAI+").font(.system(size: 28, weight: .bold, design: .rounded))
                        Text("Everything in AskAI, supercharged.")
                            .font(.system(size: 14)).foregroundStyle(.secondary)
                    }
                    .padding(.top, 10)
                    .scaleEffect(appear ? 1 : 0.9).opacity(appear ? 1 : 0)

                    VStack(spacing: 10) {
                        ForEach(Array(features.enumerated()), id: \.offset) { i, f in
                            HStack(spacing: 14) {
                                Image(systemName: f.0).font(.system(size: 18, weight: .semibold))
                                    .frame(width: 40, height: 40)
                                    .background(Color.primary.opacity(0.06), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(f.1).font(.system(size: 15, weight: .bold))
                                    Text(f.2).font(.system(size: 12)).foregroundStyle(.secondary)
                                }
                                Spacer()
                            }
                            .padding(14).frame(maxWidth: .infinity, alignment: .leading)
                            .liquidGlass(cornerRadius: 20)
                            .opacity(appear ? 1 : 0).offset(y: appear ? 0 : 16)
                            .animation(.spring(response: 0.5, dampingFraction: 0.8).delay(Double(i) * 0.05), value: appear)
                        }
                    }

                    Button {
                        UINotificationFeedbackGenerator().notificationOccurred(.success)
                    } label: {
                        Text("Manage on the web")
                            .font(.system(size: 16, weight: .bold))
                            .frame(maxWidth: .infinity).padding(.vertical, 15)
                            .background(Color.primary, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                            .foregroundStyle(Color(uiColor: .systemBackground))
                    }.buttonStyle(.plain)

                    Text("Subscriptions and AskAI coins are managed in your account on the website.")
                        .font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.center)
                }
                .padding(.horizontal, 18).padding(.bottom, 30)
            }
        }
        .onAppear { withAnimation(.spring(response: 0.6, dampingFraction: 0.75)) { appear = true } }
    }
}
