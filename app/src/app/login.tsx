import { makeRedirectUri } from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { t } from '../lib/i18n';
import { supabase } from '../lib/supabase';

// Expo Go: exp://<host>/--/..., builds: crousapp://... — both must be in Supabase's Redirect URLs.
const redirectTo = makeRedirectUri();

// Supabase OAuth via the system browser (works in Expo Go). Flow from
// https://supabase.com/docs/guides/auth/native-mobile-deep-linking
// ponytail: Google only; add Sign in with Apple before App Store submission (guideline 4.8).
async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (res.type !== 'success') return false; // user closed the browser
  const { params, errorCode } = QueryParams.getQueryParams(res.url);
  if (errorCode || params.error) throw new Error(params.error_description ?? errorCode ?? params.error);
  const { error: sessionError } = await supabase.auth.setSession({
    access_token: params.access_token,
    refresh_token: params.refresh_token,
  });
  if (sessionError) throw sessionError;
  return true;
}

// Web: full-page redirect (popups get blocked on mobile Safari); supabase-js reads the session from the URL on
// return (detectSessionInUrl). `next` is the page to come back to, since the redirect drops navigation history.
async function signInWithGoogleWeb(next: string) {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + next },
  });
  if (error) throw error;
}

export default function Login() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPress() {
    setBusy(true);
    setError(null);
    try {
      if (Platform.OS === 'web') return await signInWithGoogleWeb(next?.startsWith('/') ? next : '/');
      // Opened via deep link there is nothing to go back to
      if (await signInWithGoogle()) router.canGoBack() ? router.back() : router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <Pressable style={styles.button} onPress={onPress} disabled={busy} accessibilityRole="button">
        <Text style={styles.buttonText}>{t.continueWithGoogle}</Text>
      </Pressable>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 12 },
  button: { borderWidth: 1, borderColor: '#747775', borderRadius: 24, paddingVertical: 12, alignItems: 'center' },
  buttonText: { fontSize: 16, fontWeight: '500', color: '#1f1f1f' },
  error: { color: '#c00' },
});
