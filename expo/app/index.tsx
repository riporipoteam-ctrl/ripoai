import { useRef, useState } from 'react'
import { ActivityIndicator, PlatformColor, Text, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { WebView } from 'react-native-webview'
import { AdaptiveGlass } from '@/components/adaptive-glass'

const SITE_URL = 'https://riporipoteam-ctrl.github.io/ripoai/'

const INJECT_NATIVE_MARKER = `
  (function () {
    document.documentElement.classList.add('native', 'ios', 'expo-shell');
    document.documentElement.dataset.ripoaiShell = 'expo-ios';
  })();
  true;
`

export default function AskAIExpoShell() {
  const insets = useSafeAreaInsets()
  const webRef = useRef<WebView>(null)
  const [loading, setLoading] = useState(true)

  return (
    <View style={{ flex: 1, backgroundColor: '#050505' }}>
      <StatusBar style="light" />
      <WebView
        ref={webRef}
        source={{ uri: SITE_URL }}
        injectedJavaScriptBeforeContentLoaded={INJECT_NATIVE_MARKER}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        pullToRefreshEnabled
        allowsBackForwardNavigationGestures
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        setSupportMultipleWindows={false}
        startInLoadingState
        style={{ flex: 1, backgroundColor: '#050505' }}
        containerStyle={{ backgroundColor: '#050505' }}
      />

      {loading && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: insets.bottom + 24,
            alignItems: 'center',
          }}
        >
          <AdaptiveGlass style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ActivityIndicator color={PlatformColor('label')} />
              <Text style={{ color: PlatformColor('label'), fontSize: 12, fontWeight: '700' }}>Loading AskAI</Text>
            </View>
          </AdaptiveGlass>
        </View>
      )}
    </View>
  )
}
