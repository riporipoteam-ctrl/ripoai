import WidgetKit
import SwiftUI
#if canImport(ActivityKit)
import ActivityKit

@main
struct AskAIWidgetBundle: WidgetBundle {
    var body: some Widget { AskAITaskLiveActivity() }
}

struct AskAITaskLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: AskAIActivityAttributes.self) { context in
            // Lock-screen / banner presentation
            HStack(spacing: 12) {
                ZStack {
                    Circle().fill(.white.opacity(0.12)).frame(width: 40, height: 40)
                    Image(systemName: icon(context.state))
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(.white)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(context.attributes.title).font(.system(size: 13, weight: .bold)).lineLimit(1).foregroundStyle(.white)
                    Text(context.state.status).font(.system(size: 12)).foregroundStyle(.white.opacity(0.7))
                }
                Spacer()
                if context.state.progress > 0 {
                    ProgressView(value: context.state.progress).frame(width: 46).tint(.white)
                } else {
                    ProgressView().tint(.white)
                }
            }
            .padding(14)
            .activityBackgroundTint(.black.opacity(0.85))
            .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: icon(context.state))
                        .font(.system(size: 20, weight: .bold))
                        .foregroundStyle(.white)
                        .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if context.state.isVoiceCall {
                        Image(systemName: "waveform").symbolEffect(.variableColor.iterative).foregroundStyle(.green)
                    } else if context.state.progress > 0 {
                        Text("\(Int(context.state.progress * 100))%").font(.system(size: 14, weight: .bold)).foregroundStyle(.white)
                    } else {
                        ProgressView().tint(.white)
                    }
                }
                DynamicIslandExpandedRegion(.center) {
                    VStack(spacing: 2) {
                        Text(context.attributes.title).font(.system(size: 13, weight: .bold)).lineLimit(1).foregroundStyle(.white)
                        Text(context.state.status).font(.system(size: 11)).foregroundStyle(.white.opacity(0.7))
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    if !context.state.detail.isEmpty {
                        Text(context.state.detail).font(.system(size: 12)).foregroundStyle(.white.opacity(0.8)).lineLimit(2)
                    }
                }
            } compactLeading: {
                Image(systemName: icon(context.state)).foregroundStyle(context.state.isVoiceCall ? .green : .white)
            } compactTrailing: {
                if context.state.isVoiceCall {
                    Image(systemName: "waveform").foregroundStyle(.green)
                } else if context.state.progress > 0 {
                    Text("\(Int(context.state.progress * 100))%").font(.system(size: 12, weight: .bold))
                } else {
                    ProgressView().tint(.white).scaleEffect(0.7)
                }
            } minimal: {
                Image(systemName: icon(context.state)).foregroundStyle(context.state.isVoiceCall ? .green : .white)
            }
            .keylineTint(.white)
        }
    }

    private func icon(_ s: AskAIActivityAttributes.ContentState) -> String {
        if s.isVoiceCall { return "phone.fill" }
        if s.status.lowercased().contains("search") { return "globe" }
        if s.status.lowercased().contains("image") { return "photo" }
        return "sparkles"
    }
}
#endif
