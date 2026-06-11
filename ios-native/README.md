# AskAI — Native SwiftUI app (Apple Liquid Glass)

A real native iOS app (not a web view), written in SwiftUI, using Apple's
**Liquid Glass** (`.glassEffect`) on iOS 26+ with a frosted-material fallback
on older systems.

## What's here (v1)
- Streaming chat against the Groq backend (`GroqClient`)
- Liquid Glass design system (`Theme/LiquidGlass.swift`)
- Chat screen, animated empty state, glass composer, message bubbles
- Chat history sheet, settings sheet, model picker
- Local persistence (UserDefaults JSON)

## Build (CI)
`.github/workflows/ios-native.yml` builds an unsigned `.ipa` on a macOS runner
with the latest Xcode (needs the iOS 26 SDK for full Liquid Glass). The Groq key
is injected from the `VITE_GROQ_API_KEY` GitHub secret into `Secrets.swift`.

Output: GitHub release tag `ios-native-latest` → `AskAI-native.ipa`
(sideload with AltStore/Sideloadly).

## Build locally (Mac)
```
brew install xcodegen
cd ios-native && xcodegen generate && open AskAI.xcodeproj
```
Set your signing team in Xcode, then Run.

## Roadmap (porting remaining web screens)
- Image generation + web image search cards
- Agent mode (browser) & Agent Team
- Projects, Plus, Admin
- Firebase auth + cloud sync
