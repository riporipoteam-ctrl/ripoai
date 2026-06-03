import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'io.github.riporipoteam.ripoai',
  appName: 'RipoAI',
  webDir: 'dist',
  backgroundColor: '#0b0b0f',
  android: {
    backgroundColor: '#0b0b0f',
  },
  ios: {
    backgroundColor: '#0b0b0f',
    contentInset: 'always',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      backgroundColor: '#0b0b0f',
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
