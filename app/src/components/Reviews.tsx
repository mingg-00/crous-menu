import type { Session } from '@supabase/supabase-js';
import { Link } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Button, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  blockAuthor,
  deleteAccount,
  deleteMyReview,
  fetchReviews,
  reportReview,
  saveMyReview,
  type Reviews as ReviewsData,
} from '../lib/api';
import { t } from '../lib/i18n';
import { supabase } from '../lib/supabase';

const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

function TextButton({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" hitSlop={6}>
      <Text style={[styles.textButton, danger && styles.danger]}>{label}</Text>
    </Pressable>
  );
}

/** Today's lunch reviews for one restaurant, plus the form for the logged-in user's own review.
 * `returnTo` is where web login redirects back to (a full-page redirect loses navigation history). */
export function Reviews({ code, returnTo }: { code: number; returnTo: string }) {
  const [data, setData] = useState<ReviewsData | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionsFor, setActionsFor] = useState<number | null>(null); // review whose report/block row is open
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);
  const mine = data?.reviews.find((r) => r.mine);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const load = useCallback(async () => {
    try {
      const d = await fetchReviews(code);
      setData(d);
      const own = d.reviews.find((r) => r.mine);
      setRating(own?.rating ?? 0);
      setComment(own?.comment ?? '');
    } catch {
      setError(t.loadError);
    }
  }, [code]);

  // Reload when login state changes so `mine` is right.
  useEffect(() => {
    load();
  }, [load, session]);

  function toggleActions(id: number | null) {
    setActionsFor(id);
    setConfirmBlock(false);
  }

  async function save(action: () => Promise<void>, doneMessage?: string) {
    setError(null);
    setNotice(null);
    try {
      await action();
      toggleActions(null);
      await load();
      if (doneMessage) setNotice(doneMessage);
    } catch (e) {
      setError(e instanceof Error && e.message === 'comment_rejected' ? t.commentRejected : t.reviewError);
    }
  }

  async function removeAccount() {
    setError(null);
    try {
      await deleteAccount();
      await supabase.auth.signOut({ scope: 'local' }); // the account is gone server-side; just drop the session
      setConfirmDeleteAccount(false);
      setNotice(t.accountDeleted);
    } catch {
      setError(t.deleteAccountError);
    }
  }

  // Inline actions rather than Alert: react-native-web's Alert.alert is a no-op.
  return (
    <View style={styles.section}>
      <Text style={styles.title}>{t.reviewsTitle}</Text>
      <Text style={styles.summary}>
        {data?.average != null ? `★ ${data.average} (${data.count})` : t.noReviews}
      </Text>

      {session ? (
        <View style={styles.form}>
          <View style={styles.starRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} onPress={() => setRating(n)} accessibilityRole="button" accessibilityLabel={`${n}/5`} hitSlop={6}>
                <Text style={styles.star}>{n <= rating ? '★' : '☆'}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            style={styles.input}
            placeholder={t.commentPlaceholder}
            value={comment}
            onChangeText={setComment}
            maxLength={500}
            multiline
          />
          <Button
            title={mine ? t.update : t.submit}
            disabled={!rating}
            onPress={() => save(() => saveMyReview(code, rating, comment))}
          />
          {mine && <Button title={t.delete} color="#c00" onPress={() => save(() => deleteMyReview(code))} />}
          <Button title={t.logout} color="#666" onPress={() => supabase.auth.signOut()} />
          {confirmDeleteAccount ? (
            <View style={styles.actions}>
              <Text style={styles.hint}>{t.deleteAccountConfirm}</Text>
              <TextButton label={t.deleteAccount} danger onPress={removeAccount} />
              <TextButton label={t.cancel} onPress={() => setConfirmDeleteAccount(false)} />
            </View>
          ) : (
            <TextButton label={t.deleteAccount} danger onPress={() => setConfirmDeleteAccount(true)} />
          )}
        </View>
      ) : (
        <Link href={{ pathname: '/login', params: { next: returnTo } }} style={styles.link}>
          {t.loginToReview}
        </Link>
      )}
      {error && <Text style={styles.error}>{error}</Text>}
      {notice && <Text style={styles.notice}>{notice}</Text>}

      <Link href="/privacy" style={styles.privacyLink}>
        {t.privacy}
      </Link>

      {data?.reviews.map((r) => (
        <View key={r.id} style={styles.review}>
          <View style={styles.reviewRow}>
            <View style={styles.reviewBody}>
              <Text style={styles.reviewStars}>{stars(r.rating)}</Text>
              {!!r.comment && <Text>{r.comment}</Text>}
            </View>
            {session && !r.mine && (
              <Pressable
                onPress={() => toggleActions(actionsFor === r.id ? null : r.id)}
                accessibilityRole="button"
                accessibilityLabel={t.more}
                hitSlop={10}>
                <Text style={styles.more}>⋯</Text>
              </Pressable>
            )}
          </View>
          {actionsFor === r.id &&
            (confirmBlock ? (
              <View style={styles.actions}>
                <Text style={styles.hint}>{t.blockConfirm}</Text>
                <TextButton label={t.block} danger onPress={() => save(() => blockAuthor(r.id))} />
                <TextButton label={t.cancel} onPress={() => toggleActions(null)} />
              </View>
            ) : (
              <View style={styles.actions}>
                <Text style={styles.hint}>{t.reportReason}</Text>
                <TextButton label={t.reportSpam} onPress={() => save(() => reportReview(r.id, 'spam'), t.reportDone)} />
                <TextButton
                  label={t.reportOffensive}
                  onPress={() => save(() => reportReview(r.id, 'offensive'), t.reportDone)}
                />
                <TextButton label={t.block} danger onPress={() => setConfirmBlock(true)} />
                <TextButton label={t.cancel} onPress={() => toggleActions(null)} />
              </View>
            ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 8, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderColor: '#ccc', gap: 8 },
  title: { fontSize: 22, fontWeight: '700' },
  summary: { fontSize: 16, color: '#444' },
  form: { gap: 8 },
  starRow: { flexDirection: 'row', gap: 8 },
  star: { fontSize: 32, color: '#f5a623' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, minHeight: 60, fontSize: 16 },
  link: { color: '#0a7ea4', fontSize: 16, paddingVertical: 8 },
  error: { color: '#c00' },
  notice: { color: '#2e7d32' },
  review: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#eee' },
  reviewRow: { flexDirection: 'row' },
  reviewBody: { flex: 1 },
  actions: { marginTop: 8, padding: 8, gap: 8, backgroundColor: '#f6f6f6', borderRadius: 8 },
  hint: { color: '#444' },
  textButton: { color: '#0a7ea4', fontSize: 16, paddingVertical: 4 },
  danger: { color: '#c00' },
  privacyLink: { color: '#666', fontSize: 13, textDecorationLine: 'underline' },
  more: { fontSize: 20, color: '#666', paddingHorizontal: 8 },
  reviewStars: { color: '#f5a623' },
});
