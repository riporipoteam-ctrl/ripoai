import SwiftUI

struct SettingsSheet: View {
    @EnvironmentObject var store: AppStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            GlassBackground()
            VStack(alignment: .leading, spacing: 16) {
                Text("Settings").font(.system(size: 22, weight: .bold, design: .rounded))
                    .padding(.top, 18)

                Text("Model").font(.system(size: 13, weight: .bold)).foregroundStyle(.secondary)
                VStack(spacing: 8) {
                    ForEach(AIModel.all) { m in
                        Button { store.model = m } label: {
                            HStack {
                                Text(m.name).font(.system(size: 15, weight: .semibold))
                                Spacer()
                                if store.model.id == m.id { Image(systemName: "checkmark.circle.fill").foregroundStyle(Color.accentColor) }
                            }
                            .padding(.horizontal, 14).padding(.vertical, 13)
                            .frame(maxWidth: .infinity)
                            .liquidGlass(cornerRadius: 18)
                        }.buttonStyle(.plain).foregroundStyle(.primary)
                    }
                }

                Spacer()
                Text("AskAI for iOS · Liquid Glass").font(.caption).foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .center)
            }
            .padding(.horizontal, 18).padding(.bottom, 20)
        }
    }
}
