# RipoAI Expo iOS Shell

This Expo app wraps the live RipoAI web app at `https://riporipoteam-ctrl.github.io/ripoai/` so the iOS app stays connected to the same website, chat data, AI features, and update path.

## Run

```bash
npm install
npm start
```

Open the QR code in Expo Go for a quick preview. Use `npm run ios` for a local native build, or `npm run build:ios` after configuring Expo EAS credentials.

## Release Notes

- The WebView loads the live GitHub Pages URL, so website updates are visible to installed app users without rebuilding the native wrapper.
- `expo-glass-effect` is used when Liquid Glass is available on iOS 26+, with `expo-blur` as the fallback.
- EAS production builds require an Expo account, `EXPO_TOKEN`, and Apple credentials.
