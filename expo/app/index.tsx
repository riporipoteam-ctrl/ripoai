import { useRef, useState } from 'react'
import { ActivityIndicator, Linking, PlatformColor, Pressable, Text, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { WebView, type WebViewNavigation } from 'react-native-webview'
import { AdaptiveGlass } from '@/components/adaptive-glass'

const SITE_URL = 'https://riporipoteam-ctrl.github.io/ripoai/'

const INJECT_NATIVE_MARKER = `
  (function () {
    document.documentElement.classList.add('native', 'ios', 'expo-shell');
    document.documentElement.dataset.ripoaiShell = 'expo-ios';
  })();
  true;
`

function tap() {
  Haptics.selectionAsync().catch(() => {})
}

export default function RipoAIExpoShell() {
  const insets = useSafeAreaInsets()
  const webRef = useRef<WebView>(null)
  const [loading, setLoading] = useState(true)
  const [canGoBack, setCanGoBack] = useState(false)
  const [currentUrl, setCurrentUrl] = useState(SITE_URL)

  function onNav(nav: WebViewNavigation) {
    setCanGoBack(nav.canGoBack)
    setCurrentUrl(nav.url || SITE_URL)
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#050505' }}>
      <StatusBar style="light" />
      <WebView
        ref={webRef}
        source={{ uri: SITE_URL }}
        injectedJavaScriptBeforeContentLoaded={INJECT_NATIVE_MARKER}
        onNavigationStateChange={onNav}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        pullToRefreshEnabled
        allowsBackForwardNavigationGestures
        setSupportMultipleWindows={false}
        startInLoadingState
        style={{ flex: 1, backgroundColor: '#050505' }}
        containerStyle={{ backgroundColor: '#050505' }}
      />

      <AdaptiveGlass
        interactive
        style={{
          position: 'absolute',
          top: insets.top + 8,
          left: 12,
          right: 12,
          minHeight: 56,
          paddingHorizontal: 12,
          paddingVertical: 8,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(255,255,255,0.16)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.22)',
            }}
          >
            <Text style={{ color: '#fff', fontSize: 17, fontWeight: '800' }}>R</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text selectable style={{ color: PlatformColor('label'), fontSize: 15, fontWeight: '800' }}>
              RipoAI
            </Text>
            <Text selectable numberOfLines={1} style={{ color: PlatformColor('secondaryLabel'), fontSize: 11 }}>
              {currentUrl.replace(/^https?:\/\//, '')}
            </Text>
          </View>

          {canGoBack && (
            <Pressable
              onPress={() => {
                tap()
                webRef.current?.goBack()
              }}
              style={({ pressed }) => ({
                opacity: pressed ? 0.65 : 1,
                paddingHorizontal: 10,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: 'rgba(255,255,255,0.14)',
              })}
            >
              <Text style={{ color: PlatformColor('label'), fontSize: 12, fontWeight: '700' }}>Back</Text>
            </Pressable>
          )}

          <Pressable
            onPress={() => {
              tap()
              webRef.current?.reload()
            }}
            style={({ pressed }) => ({
              opacity: pressed ? 0.65 : 1,
              paddingHorizontal: 10,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: 'rgba(255,255,255,0.14)',
            })}
          >
            <Text style={{ color: PlatformColor('label'), fontSize: 12, fontWeight: '700' }}>Reload</Text>
          </Pressable>

          <Pressable
            onPress={() => {
              tap()
              Linking.openURL(currentUrl || SITE_URL).catch(() => {})
            }}
            style={({ pressed }) => ({
              opacity: pressed ? 0.65 : 1,
              paddingHorizontal: 10,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: 'rgba(255,255,255,0.18)',
            })}
          >
            <Text style={{ color: PlatformColor('label'), fontSize: 12, fontWeight: '800' }}>Open</Text>
          </Pressable>
        </View>
      </AdaptiveGlass>

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
              <Text style={{ color: PlatformColor('label'), fontSize: 12, fontWeight: '700' }}>Loading RipoAI</Text>
            </View>
          </AdaptiveGlass>
        </View>
      )}
    </View>
  )
}
