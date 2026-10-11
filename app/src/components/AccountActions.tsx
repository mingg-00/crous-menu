import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { deleteAccount } from '../lib/api';
import { t } from '../lib/i18n';
import { supabase } from '../lib/supabase';
import { color, font, space } from '../lib/theme';

function TextButton({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.hit}>
      <Text style={[styles.button, danger && styles.danger]}>{label}</Text>
    </Pressable>
  );
}

/** Log out and delete the account (App Store 5.1.1(v), GDPR erasure), on the home screen rather than next to a
 * review form so a destructive tap can't be a slip. Renders nothing when logged out, except the result notice. */
export function AccountActions() {
  const [session, setSession] = useState<Session | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  async function remove() {
    setMessage(null);
    try {
      await deleteAccount();
      await supabase.auth.signOut({ scope: 'local' }); // the account is gone server-side; just drop the session
      setConfirm(false);
      setMessage({ text: t.accountDeleted });
    } catch {
      setMessage({ text: t.deleteAccountError, error: true });
    }
  }

  return (
    <View style={styles.box}>
      {session &&
        (confirm ? (
          <>
            <Text style={styles.hint}>{t.deleteAccountConfirm}</Text>
            <View style={styles.row}>
              <TextButton label={t.deleteAccount} danger onPress={remove} />
              <TextButton label={t.cancel} onPress={() => setConfirm(false)} />
            </View>
          </>
        ) : (
          <View style={styles.row}>
            <TextButton label={t.logout} onPress={() => supabase.auth.signOut()} />
            <TextButton label={t.deleteAccount} danger onPress={() => setConfirm(true)} />
          </View>
        ))}
      {message && (
        <Text style={message.error ? styles.error : styles.notice} accessibilityLiveRegion="polite">
          {message.error ? '⚠︎' : '✓'} {message.text}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', gap: space.xs },
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.xl },
  hit: { minHeight: 44, justifyContent: 'center' },
  button: { ...font.bodyStrong, fontSize: 15, color: color.ink2 },
  danger: { color: color.danger },
  hint: { ...font.body, fontSize: 15, color: color.ink2, textAlign: 'center' },
  notice: { ...font.body, fontSize: 15, color: color.success, textAlign: 'center' },
  error: { ...font.body, fontSize: 15, color: color.danger, textAlign: 'center' },
});
