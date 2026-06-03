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
}

export default config
