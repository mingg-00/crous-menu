import type { Session } from '@supabase/supabase-js';
import { Link } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  blockAuthor,
  deleteMyReview,
  fetchReviews,
  reportReview,
  saveMyReview,
  type Reviews as ReviewsData,
} from '../lib/api';
import { t } from '../lib/i18n';
import { supabase } from '../lib/supabase';

const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

/** Today's lunch reviews for one restaurant, plus the form for the logged-in user's own review. */
export function Reviews({ code }: { code: number }) {
  const [data, setData] = useState<ReviewsData | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
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

  async function save(action: () => Promise<void>, doneMessage?: string) {
    setError(null);
    try {
      await action();
      await load();
      if (doneMessage) Alert.alert(doneMessage);
    } catch (e) {
      setError(e instanceof Error && e.message === 'comment_rejected' ? t.commentRejected : t.reviewError);
    }
  }

  // Android shows at most 3 alert buttons, so report reasons get their own dialog.
  function openActions(id: number) {
    Alert.alert(t.more, undefined, [
      {
        text: t.report,
        onPress: () =>
          Alert.alert(t.report, t.reportReason, [
            { text: t.reportSpam, onPress: () => save(() => reportReview(id, 'spam'), t.reportDone) },
            { text: t.reportOffensive, onPress: () => save(() => reportReview(id, 'offensive'), t.reportDone) },
            { text: t.cancel, style: 'cancel' },
          ]),
      },
      {
        text: t.block,
        style: 'destructive',
        onPress: () =>
          Alert.alert(t.block, t.blockConfirm, [
            { text: t.cancel, style: 'cancel' },
            { text: t.block, style: 'destructive', onPress: () => save(() => blockAuthor(id)) },
          ]),
      },
      { text: t.cancel, style: 'cancel' },
    ]);
  }

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
        </View>
      ) : (
        <Link href="/login" style={styles.link}>
          {t.loginToReview}
        </Link>
      )}
      {error && <Text style={styles.error}>{error}</Text>}

      {data?.reviews.map((r) => (
        <View key={r.id} style={styles.review}>
          <View style={styles.reviewBody}>
            <Text style={styles.reviewStars}>{stars(r.rating)}</Text>
            {!!r.comment && <Text>{r.comment}</Text>}
          </View>
          {session && !r.mine && (
            <Pressable onPress={() => openActions(r.id)} accessibilityRole="button" accessibilityLabel={t.more} hitSlop={10}>
              <Text style={styles.more}>⋯</Text>
            </Pressable>
          )}
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
  review: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#eee' },
  reviewBody: { flex: 1 },
  more: { fontSize: 20, color: '#666', paddingHorizontal: 8 },
  reviewStars: { color: '#f5a623' },
});
