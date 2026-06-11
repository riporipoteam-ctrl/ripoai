import SwiftUI

struct Composer: View {
    @EnvironmentObject var store: AppStore
    @Binding var draft: String
    var focused: FocusState<Bool>.Binding
    let send: (String) -> Void

    var body: some View {
        VStack(spacing: 6) {
            if let err = store.errorText {
                Text(err).font(.caption).foregroundStyle(.secondary)
                    .padding(.horizontal, 18)
            }
            HStack(alignment: .bottom, spacing: 10) {
                TextField("Message AskAI…", text: $draft, axis: .vertical)
                    .focused(focused)
                    .font(.system(size: 16))
                    .lineLimit(1...6)
                    .padding(.leading, 18).padding(.vertical, 13)

                Button {
                    if store.isStreaming { store.stop() } else { send(draft) }
                } label: {
                    Image(systemName: store.isStreaming ? "stop.fill" : "arrow.up")
                        .font(.system(size: 17, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 40, height: 40)
                        .background(
                            Circle().fill(
                                (draft.isEmpty && !store.isStreaming)
                                ? AnyShapeStyle(Color.gray.opacity(0.5))
                                : AnyShapeStyle(LinearGradient(colors: [Color.accentColor, Color(hex: 0xBE8CFF)],
                                                               startPoint: .top, endPoint: .bottom))
                            )
                        )
                }
                .buttonStyle(.plain)
                .disabled(draft.isEmpty && !store.isStreaming)
                .padding(.trailing, 6).padding(.bottom, 6)
            }
            .liquidGlass(cornerRadius: 28, interactive: true)
            .padding(.horizontal, 12)
            .padding(.bottom, 8)
        }
    }
}
