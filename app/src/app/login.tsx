import { makeRedirectUri } from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import { Link, router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { t } from '../lib/i18n';
import { isInAppBrowser, openInExternalBrowser } from '../lib/inAppBrowser';
import { supabase } from '../lib/supabase';
import { color, font, MAX_WIDTH, radius, space } from '../lib/theme';

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
  const [inApp] = useState(isInAppBrowser);
  const [manual, setManual] = useState(false); // this app can't be left automatically: show how to do it by hand
  const [copied, setCopied] = useState(false);

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
      <Image source={require('../../assets/brand/mark.png')} style={styles.mark} accessibilityIgnoresInvertColors />
      <Text style={styles.heading}>{t.loginToReview}</Text>
      {inApp && (
        <View style={styles.inApp} role="alert">
          <Text style={styles.inAppTitle}>{t.inAppTitle}</Text>
          <Text style={styles.inAppText}>{t.inAppBody}</Text>
          {manual ? (
            <>
              <Text style={styles.inAppText}>{t.inAppIos}</Text>
              <Text style={styles.url} selectable>
                {window.location.href}
              </Text>
              <Pressable
                style={styles.secondary}
                role="button"
                onPress={() => navigator.clipboard?.writeText(window.location.href).then(() => setCopied(true), () => {})}>
                <Text style={styles.secondaryText}>{copied ? t.linkCopied : t.copyLink}</Text>
              </Pressable>
            </>
          ) : (
            <Pressable style={styles.primary} role="button" onPress={() => setManual(!openInExternalBrowser(window.location.href))}>
              <Text style={styles.primaryText}>{t.openInBrowser}</Text>
            </Pressable>
          )}
        </View>
      )}
      <Pressable style={styles.button} onPress={onPress} disabled={busy} accessibilityRole="button">
        <Image source={require('../../assets/brand/google-g.png')} style={styles.googleG} accessibilityIgnoresInvertColors />
        <Text style={styles.buttonText}>{t.continueWithGoogle}</Text>
      </Pressable>
      {error && <Text style={styles.error}>{error}</Text>}
      <Link href="/privacy" style={styles.privacy}>
        {t.privacy}
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', padding: space.xl, gap: space.lg, alignItems: 'stretch' },
  mark: { width: 64, height: 64, alignSelf: 'center', marginTop: space.xl },
  heading: { ...font.title, color: color.ink, textAlign: 'center', marginBottom: space.sm },
  // Google's sign-in button stays neutral per its branding guidelines.
  button: {
    minHeight: 48,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: space.md,
    borderWidth: 1,
    borderColor: '#747775',
    borderRadius: 24,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  googleG: { width: 20, height: 20 },
  buttonText: { fontSize: 16, fontWeight: '500', color: '#1f1f1f' },
  error: { ...font.body, color: color.danger },
  inApp: { padding: space.lg, gap: space.sm, backgroundColor: color.brandTint, borderRadius: radius.md },
  inAppTitle: { ...font.bodyStrong, color: color.ink },
  inAppText: { ...font.body, fontSize: 15, color: color.ink2 },
  url: { ...font.caption, color: color.ink, backgroundColor: color.surface, padding: space.sm, borderRadius: radius.sm },
  primary: { minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: radius.pill, backgroundColor: color.brand },
  primaryText: { ...font.bodyStrong, color: '#fff' },
  secondary: { minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: radius.pill, borderWidth: 1, borderColor: color.brand },
  secondaryText: { ...font.bodyStrong, color: color.brandPressed },
  privacy: { ...font.caption, color: color.ink3, textAlign: 'center', textDecorationLine: 'underline' },
});
