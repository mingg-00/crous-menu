import { router } from 'expo-router';
import { useState } from 'react';
import { Button, StyleSheet, Text, TextInput, View } from 'react-native';

import { t } from '../lib/i18n';
import { supabase } from '../lib/supabase';

// ponytail: email code only; add Sign in with Apple / Google before store submission.
export default function Login() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<{ error: Error | null }>, onSuccess: () => void) {
    setBusy(true);
    setError(null);
    const { error } = await action();
    setBusy(false);
    if (error) setError(error.message);
    else onSuccess();
  }

  const sendCode = () => run(() => supabase.auth.signInWithOtp({ email: email.trim() }), () => setSent(true));
  const verify = () =>
    run(() => supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' }), () => router.back());

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder={t.email}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        editable={!sent}
      />
      {!sent && <Button title={t.sendCode} onPress={sendCode} disabled={busy || !email.includes('@')} />}
      {sent && (
        <>
          <Text style={styles.hint}>{t.codeSent}</Text>
          <TextInput
            style={styles.input}
            placeholder={t.code}
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={10}
          />
          <Button title={t.verify} onPress={verify} disabled={busy || code.trim().length < 6} />
        </>
      )}
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 12 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, fontSize: 16 },
  hint: { color: '#444' },
  error: { color: '#c00' },
});
