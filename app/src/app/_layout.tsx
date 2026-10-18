import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { LanguagePicker } from '../components/LanguagePicker';
import { lang, t } from '../lib/i18n';
import { color, MAX_WIDTH, space } from '../lib/theme';

function Brand() {
  return (
    <View style={styles.brand} accessibilityRole="header">
      <Image source={require('../../assets/brand/mark.png')} style={styles.mark} accessibilityIgnoresInvertColors />
      <Text style={styles.wordmark}>
        Resto U <Text style={styles.wordmarkAccent}>Menu</Text>
      </Text>
    </View>
  );
}

/** Back, or home when there is no history (a shared link, or the page web login returns to). */
function BackButton({ canGoBack }: { canGoBack: boolean }) {
  return (
    <Pressable
      onPress={() => (canGoBack ? router.back() : router.replace('/'))}
      accessibilityRole="button"
      accessibilityLabel={canGoBack ? t.back : t.nearby}
      style={styles.back}>
      {canGoBack ? (
        <Text style={styles.backArrow}>←</Text>
      ) : (
        <Image source={require('../../assets/brand/mark.png')} style={styles.mark} accessibilityIgnoresInvertColors />
      )}
    </Pressable>
  );
}

// Cloudflare Web Analytics: cookieless visit counts for the web build. The token is public (it ships in the page).
const CF_BEACON_TOKEN = 'a3f14f1b221c4ca18c3e06d9e83d18aa';
if (Platform.OS === 'web' && typeof document !== 'undefined' && CF_BEACON_TOKEN) {
  const s = document.createElement('script');
  s.defer = true;
  s.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  s.dataset.cfBeacon = JSON.stringify({ token: CF_BEACON_TOKEN, spa: true });
  document.head.appendChild(s);
}

export default function Layout() {
  // Remount every screen on a language change so texts re-render and menus are re-fetched in the new language.
  const [current, setCurrent] = useState(lang);
  // Web: line the header up with the centered content column instead of the window edges.
  const { width } = useWindowDimensions();
  const inset = Platform.OS === 'web' ? Math.max(0, (width - MAX_WIDTH) / 2) : 0;
  return (
    <Stack
      key={current}
      screenOptions={({ navigation, route }) => ({
        headerStyle: { backgroundColor: color.surface },
        headerTintColor: color.brand,
        headerTitleStyle: { color: color.ink, fontWeight: '700' },
        contentStyle: { backgroundColor: color.bg },
        // Native keeps its own back button (and swipe-back) whenever there is somewhere to go back to.
        headerLeft:
          route.name === 'index' || (Platform.OS !== 'web' && navigation.canGoBack())
            ? undefined
            : () => (
                <View style={{ marginLeft: inset }}>
                  <BackButton canGoBack={navigation.canGoBack()} />
                </View>
              ),
      })}>
      <Stack.Screen
        name="index"
        options={{
          title: t.nearby,
          headerTitle: () => (
            <View style={{ marginLeft: inset }}>
              <Brand />
            </View>
          ),
          headerRight: () => (
            <View style={{ marginRight: inset }}>
              <LanguagePicker onChange={setCurrent} />
            </View>
          ),
        }}
      />
      <Stack.Screen name="login" options={{ title: t.login, presentation: 'modal' }} />
      <Stack.Screen name="privacy" options={{ title: t.privacy }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mark: { width: 30, height: 30 },
  wordmark: { fontSize: 19, fontWeight: '800', color: color.ink, letterSpacing: -0.3 },
  wordmarkAccent: { color: color.brand },
  back: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', marginLeft: space.sm },
  backArrow: { fontSize: 24, color: color.brand },
});
