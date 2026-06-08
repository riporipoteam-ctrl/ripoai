import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'io.github.riporipoteam.ripoai',
  appName: 'AskAI',
  webDir: 'dist',
  backgroundColor: '#1e1d1b',
  // Load the LIVE deployed web app instead of the bundled copy, so every push
  // that redeploys the site instantly updates the installed Android/iOS app —
  // no reinstall needed. The native shell (status bar, haptics, splash, bottom
  // sheets, glassier .native styling) still applies, so it stays app-like.
  server: {
    url: 'https://riporipoteam-ctrl.github.io/ripoai/',
    cleartext: false,
  },
  android: {
    backgroundColor: '#1e1d1b',
  },
  ios: {
    backgroundColor: '#1e1d1b',
    contentInset: 'always',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      backgroundColor: '#1e1d1b',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
      splashImmersive: true,
    },
    StatusBar: {
      overlaysWebView: true,
      style: 'DARK',
      backgroundColor: '#00000000',
    },
    Keyboard: {
      resize: 'native',
    },
  },
}

export default config
