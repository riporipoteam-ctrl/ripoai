import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'io.github.riporipoteam.ripoai',
  appName: 'RipoAI',
  webDir: 'dist',
  backgroundColor: '#1e1d1b',
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
