import { Stack } from 'expo-router';
import { Image, StyleSheet, Text, View } from 'react-native';

import { t } from '../lib/i18n';
import { color } from '../lib/theme';

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

export default function Layout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: color.surface },
        headerTintColor: color.brand,
        headerTitleStyle: { color: color.ink, fontWeight: '700' },
        contentStyle: { backgroundColor: color.bg },
      }}>
      <Stack.Screen name="index" options={{ title: t.nearby, headerTitle: Brand }} />
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
});
