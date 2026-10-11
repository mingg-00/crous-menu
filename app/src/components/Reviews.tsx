import type { Session } from '@supabase/supabase-js';
import { Link } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  blockAuthor,
  deleteMyReview,
  fetchReviews,
  reportReview,
  saveMyReview,
  type Reviews as ReviewsData,
} from '../lib/api';
import { lang, t } from '../lib/i18n';
import { RatingText } from './RatingText';
import { supabase } from '../lib/supabase';
import { color, font, radius, shadow, space } from '../lib/theme';

const MAX_COMMENT = 500; // same limit as the server
const reviewDate = (day: string) => new Date(`${day}T12:00`).toLocaleDateString(lang, { month: 'short', day: 'numeric' });
const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);
const starLabel = (n: number) => t.starLabel.replace('{n}', String(n));

function TextButton({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.textButtonHit}>
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

/** Lunch reviews of every day for one restaurant, comments shown in the reader's language, plus the form for the
 * logged-in user's review of today. `returnTo` is where web login redirects back to (a full-page redirect loses
 * navigation history). Account actions (log out, delete account) live on the home screen, not here. */
export function Reviews({ code, returnTo }: { code: number; returnTo: string }) {
  const [data, setData] = useState<ReviewsData | null>(null); // null = loading
  const [session, setSession] = useState<Session | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionsFor, setActionsFor] = useState<number | null>(null); // review whose report/block row is open
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [originals, setOriginals] = useState<Set<number>>(new Set()); // reviews switched back to the original text
  const translationPolls = useRef(0);
  const mine = data?.reviews.find((r) => r.mine && r.day === data.today); // older own reviews stay read-only

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const load = useCallback(async () => {
    try {
      const d = await fetchReviews(code, lang);
      setData(d);
      const own = d.reviews.find((r) => r.mine && r.day === d.today);
      setRating(own?.rating ?? 0);
      setComment(own?.comment ?? '');
    } catch {
      setError(t.loadFailed);
    }
  }, [code]);

  // Reload when login state changes so `mine` is right.
  useEffect(() => {
    load();
  }, [load, session]);

  // Comment translations land in the background within ~10s; re-fetch a few times until they do.
  useEffect(() => {
    if (!data?.translating || translationPolls.current >= 8) return;
    translationPolls.current += 1;
    const timer = setTimeout(load, 4000);
    return () => clearTimeout(timer);
  }, [data, load]);

  function toggleActions(id: number | null) {
    setActionsFor(id);
    setConfirmBlock(false);
  }

  function toggleOriginal(id: number) {
    setOriginals((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  async function save(action: () => Promise<void>, doneMessage: string) {
    setError(null);
    setNotice(null);
    try {
      await action();
      toggleActions(null);
      setConfirmDelete(false);
      await load();
      setNotice(doneMessage);
    } catch (e) {
      setError(e instanceof Error && e.message === 'comment_rejected' ? t.commentRejected : t.reviewError);
    }
  }

  // Inline actions rather than Alert: react-native-web's Alert.alert is a no-op.
  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={styles.title} accessibilityRole="header">
          {t.reviewsTitle}
        </Text>
        {data === null ? (
          !error && <ActivityIndicator color={color.brand} />
        ) : data.average != null ? (
          <RatingText rating={{ average: data.average, count: data.count }} style={styles.summary} />
        ) : (
          <Text style={styles.empty}>{t.noReviews}</Text>
        )}
      </View>

      {session ? (
        <View style={styles.form}>
          <Text style={styles.formTitle}>{t.yourReview}</Text>
          <View style={styles.starRow} accessibilityRole="radiogroup" accessibilityLabel={t.yourReview}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable
                key={n}
                onPress={() => setRating(n)}
                accessibilityRole="radio"
                accessibilityLabel={starLabel(n)}
                accessibilityState={{ checked: n === rating }}
                style={styles.starHit}>
                <Text style={styles.star}>{n <= rating ? '★' : '☆'}</Text>
              </Pressable>
            ))}
          </View>
          <View>
            <TextInput
              style={styles.input}
              placeholder={t.commentPlaceholder}
              placeholderTextColor={color.ink3}
              accessibilityLabel={t.commentPlaceholder} // stays as the field's name once the placeholder is gone
              value={comment}
              onChangeText={setComment}
              maxLength={MAX_COMMENT}
              multiline
            />
            <Text style={styles.counter} accessibilityLiveRegion="polite">
              {comment.length}/{MAX_COMMENT}
            </Text>
          </View>
          {confirmDelete ? (
            <View style={styles.actions}>
              <Text style={styles.hint}>{t.deleteReviewConfirm}</Text>
              <View style={styles.actionRow}>
                <TextButton label={t.delete} danger onPress={() => save(() => deleteMyReview(code), t.reviewDeleted)} />
                <TextButton label={t.cancel} onPress={() => setConfirmDelete(false)} />
              </View>
            </View>
          ) : (
            <View style={styles.formActions}>
              <PrimaryButton
                label={mine ? t.update : t.submit}
                disabled={!rating}
                onPress={() => save(() => saveMyReview(code, rating, comment), t.reviewSaved)}
              />
              {mine && <TextButton label={t.delete} danger onPress={() => setConfirmDelete(true)} />}
            </View>
          )}
        </View>
      ) : (
        <Link href={{ pathname: '/login', params: { next: returnTo } }} style={styles.loginLink}>
          {t.loginToReview}
        </Link>
      )}
      {error && (
        <Text style={styles.error} accessibilityRole="alert">
          ⚠︎ {error}
        </Text>
      )}
      {notice && (
        <Text style={styles.notice} accessibilityLiveRegion="polite">
          ✓ {notice}
        </Text>
      )}

      {data?.reviews.map((r) => {
        const showOriginal = !r.translation || originals.has(r.id);
        return (
          <View key={r.id} style={styles.review}>
            <View style={styles.reviewRow}>
              <View style={styles.reviewBody}>
                <View style={styles.reviewMeta}>
                  <Text style={styles.reviewStars} accessibilityLabel={starLabel(r.rating)}>
                    {stars(r.rating)}
                  </Text>
                  <Text style={styles.date}>{reviewDate(r.day)}</Text>
                  {r.mine && <Text style={styles.mineBadge}>{t.yourReview}</Text>}
                </View>
                {!!r.comment && <Text style={styles.comment}>{showOriginal ? r.comment : r.translation}</Text>}
                {!!r.translation && (
                  <View style={styles.translatedRow}>
                    {!showOriginal && <Text style={styles.translatedLabel}>{t.translated} ·</Text>}
                    <Pressable onPress={() => toggleOriginal(r.id)} accessibilityRole="button" hitSlop={12}>
                      <Text style={styles.link}>{showOriginal ? t.showTranslation : t.showOriginal}</Text>
                    </Pressable>
                  </View>
                )}
              </View>
              {session && !r.mine && (
                <Pressable
                  onPress={() => toggleActions(actionsFor === r.id ? null : r.id)}
                  accessibilityRole="button"
                  accessibilityLabel={t.more}
                  accessibilityState={{ expanded: actionsFor === r.id }}
                  style={styles.moreHit}>
                  <Text style={styles.more}>⋯</Text>
                </Pressable>
              )}
            </View>
            {actionsFor === r.id &&
              (confirmBlock ? (
                <View style={styles.actions}>
                  <Text style={styles.hint}>{t.blockConfirm}</Text>
                  <View style={styles.actionRow}>
                    <TextButton label={t.block} danger onPress={() => save(() => blockAuthor(r.id), t.blockConfirm)} />
                    <TextButton label={t.cancel} onPress={() => toggleActions(null)} />
                  </View>
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
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { padding: space.lg, gap: space.md, backgroundColor: color.surface, borderRadius: radius.md, ...shadow },
  headerRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  title: { ...font.title, color: color.ink },
  summary: { ...font.bodyStrong, color: color.ink },
  empty: { ...font.body, color: color.ink2 },
  form: { gap: space.sm },
  formTitle: { ...font.bodyStrong, color: color.ink },
  starRow: { flexDirection: 'row', gap: space.xs },
  starHit: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  star: { fontSize: 34, lineHeight: 40, color: color.star },
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
  counter: { ...font.caption, color: color.ink3, alignSelf: 'flex-end', marginTop: space.xs },
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
  reviewRow: { flexDirection: 'row', alignItems: 'flex-start' },
  reviewBody: { flex: 1, gap: space.xs },
  reviewMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  reviewStars: { color: color.star, letterSpacing: 1 },
  date: { ...font.caption, color: color.ink3 },
  mineBadge: {
    ...font.caption,
    fontWeight: '700',
    color: color.brandPressed,
    backgroundColor: color.brandTint,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  comment: { ...font.body, color: color.ink },
  translatedRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingVertical: space.xs },
  translatedLabel: { ...font.caption, color: color.ink3 },
  link: { ...font.caption, fontWeight: '700', color: color.ink2, textDecorationLine: 'underline' },
  actions: { marginTop: space.sm, padding: space.md, gap: space.xs, backgroundColor: color.bg, borderRadius: radius.sm },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xl },
  hint: { ...font.body, fontSize: 15, color: color.ink2 },
  textButtonHit: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  textButton: { ...font.bodyStrong, color: color.ink2 },
  danger: { color: color.danger },
  // Pulled up and out so the 44px target lines up with the stars instead of padding the row.
  moreHit: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', marginVertical: -space.md, marginRight: -space.md },
  more: { fontSize: 20, color: color.ink3 },
});
