import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { t } from '../lib/i18n';
import { color, font, radius, space } from '../lib/theme';

const SLOW_MS = 4000; // past this, the free API host is most likely waking up from sleep (~30–60s)

/** Spinner; after a few seconds also says the server is starting, so a cold start doesn't look broken. */
export function Loading() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <View style={styles.box} accessibilityLiveRegion="polite">
      <ActivityIndicator color={color.brand} />
      {slow && <Text style={styles.text}>{t.wakingUp}</Text>}
    </View>
  );
}

/** Load error with a retry button: pull-to-refresh doesn't exist on desktop browsers. */
export function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.box}>
      <Text style={styles.error} accessibilityRole="alert">
        ⚠︎ {t.loadFailed}
      </Text>
      <Pressable onPress={onRetry} accessibilityRole="button" style={({ pressed }) => [styles.retry, pressed && styles.retryPressed]}>
        <Text style={styles.retryText}>{t.retry}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { padding: space.xl, gap: space.md, alignItems: 'center' },
  text: { ...font.body, fontSize: 15, color: color.ink2, textAlign: 'center' },
  error: {
    ...font.body,
    color: color.danger,
    backgroundColor: color.dangerTint,
    padding: space.md,
    borderRadius: radius.sm,
    overflow: 'hidden',
    textAlign: 'center',
  },
  retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.xl, borderRadius: radius.pill, backgroundColor: color.brand },
  retryPressed: { backgroundColor: color.brandPressed },
  retryText: { ...font.bodyStrong, color: '#fff' },
});
