import type { Session } from '@supabase/supabase-js';
import { Link } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

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
import { color, font, radius, shadow, space } from '../lib/theme';

const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

function TextButton({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" hitSlop={6}>
      <Text style={[styles.textButton, danger && styles.danger]}>{label}</Text>
    </Pressable>
  );
}

function PrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed, disabled && styles.primaryDisabled]}>
      <Text style={styles.primaryText}>{label}</Text>
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
      <View style={styles.headerRow}>
        <Text style={styles.title} accessibilityRole="header">
          {t.reviewsTitle}
        </Text>
        <Text style={styles.summary}>
          {data?.average != null ? (
            <>
              <Text style={styles.reviewStars}>★ </Text>
              {data.average} <Text style={styles.count}>({data.count})</Text>
            </>
          ) : (
            t.noReviews
          )}
        </Text>
      </View>

      {session ? (
        <View style={styles.form}>
          <View style={styles.starRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable
                key={n}
                onPress={() => setRating(n)}
                accessibilityRole="button"
                accessibilityLabel={`${n}/5`}
                accessibilityState={{ selected: n === rating }}
                hitSlop={4}>
                <Text style={styles.star}>{n <= rating ? '★' : '☆'}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            style={styles.input}
            placeholder={t.commentPlaceholder}
            placeholderTextColor={color.ink3}
            value={comment}
            onChangeText={setComment}
            maxLength={500}
            multiline
          />
          <View style={styles.formActions}>
            <PrimaryButton
              label={mine ? t.update : t.submit}
              disabled={!rating}
              onPress={() => save(() => saveMyReview(code, rating, comment))}
            />
            {mine && <TextButton label={t.delete} danger onPress={() => save(() => deleteMyReview(code))} />}
          </View>
        </View>
      ) : (
        <Link href={{ pathname: '/login', params: { next: returnTo } }} style={styles.loginLink}>
          {t.loginToReview}
        </Link>
      )}
      {error && <Text style={styles.error}>⚠︎ {error}</Text>}
      {notice && <Text style={styles.notice}>✓ {notice}</Text>}

      {data?.reviews.map((r) => (
        <View key={r.id} style={styles.review}>
          <View style={styles.reviewRow}>
            <View style={styles.reviewBody}>
              <Text style={styles.reviewStars} accessibilityLabel={`${r.rating}/5`}>
                {stars(r.rating)}
              </Text>
              {!!r.comment && <Text style={styles.comment}>{r.comment}</Text>}
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

      {/* Account actions sit apart from the review form so a destructive tap can't be a slip. */}
      <View style={styles.footer}>
        {session &&
          (confirmDeleteAccount ? (
            <View style={styles.actions}>
              <Text style={styles.hint}>{t.deleteAccountConfirm}</Text>
              <TextButton label={t.deleteAccount} danger onPress={removeAccount} />
              <TextButton label={t.cancel} onPress={() => setConfirmDeleteAccount(false)} />
            </View>
          ) : (
            <View style={styles.footerRow}>
              <TextButton label={t.logout} onPress={() => supabase.auth.signOut()} />
              <TextButton label={t.deleteAccount} danger onPress={() => setConfirmDeleteAccount(true)} />
            </View>
          ))}
        <Link href="/privacy" style={styles.privacyLink}>
          {t.privacy}
        </Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { padding: space.lg, gap: space.md, backgroundColor: color.surface, borderRadius: radius.md, ...shadow },
  headerRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: space.sm },
  title: { ...font.title, color: color.ink },
  summary: { ...font.bodyStrong, color: color.ink },
  count: { fontWeight: '400', color: color.ink3 },
  form: { gap: space.md },
  starRow: { flexDirection: 'row', gap: space.xs },
  star: { fontSize: 34, lineHeight: 44, minWidth: 44, textAlign: 'center', color: color.star },
  input: {
    ...font.body,
    color: color.ink,
    borderWidth: 1,
    borderColor: color.inputBorder,
    borderRadius: radius.sm,
    padding: space.md,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  formActions: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  primary: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
    backgroundColor: color.brand,
  },
  primaryPressed: { backgroundColor: color.brandPressed },
  primaryDisabled: { opacity: 0.4 },
  primaryText: { ...font.bodyStrong, color: '#fff' },
  loginLink: {
    ...font.bodyStrong,
    alignSelf: 'flex-start',
    color: color.brandPressed,
    backgroundColor: color.brandTint,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  error: { ...font.body, color: color.danger, backgroundColor: color.dangerTint, padding: space.md, borderRadius: radius.sm, overflow: 'hidden' },
  notice: { ...font.body, color: color.success },
  review: { paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderColor: color.line },
  reviewRow: { flexDirection: 'row' },
  reviewBody: { flex: 1, gap: space.xs },
  comment: { ...font.body, color: color.ink },
  actions: { marginTop: space.sm, padding: space.md, gap: space.sm, backgroundColor: color.bg, borderRadius: radius.sm },
  hint: { ...font.body, fontSize: 15, color: color.ink2 },
  textButton: { ...font.bodyStrong, color: color.ink2, paddingVertical: space.xs },
  danger: { color: color.danger },
  footer: { marginTop: space.sm, paddingTop: space.md, gap: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderColor: color.line },
  footerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xl },
  privacyLink: { ...font.caption, color: color.ink3, textDecorationLine: 'underline' },
  more: { fontSize: 20, color: color.ink3, paddingHorizontal: space.sm },
  reviewStars: { color: color.star, letterSpacing: 1 },
});
