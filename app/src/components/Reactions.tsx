import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fetchReactions, setReaction, type ReactionCounts } from '../lib/api';
import { t } from '../lib/i18n';
import { REACTIONS, type ReactionKind } from '../lib/reactions';
import { color, font, radius, shadow, space } from '../lib/theme';

/** One-tap emoji reaction to today's lunch, no login. Tapping your current reaction removes it. */
export function Reactions({ code }: { code: number }) {
  const [counts, setCounts] = useState<ReactionCounts>({});
  const [mine, setMine] = useState<ReactionKind | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetchReactions(code).then(
      (r) => {
        setCounts(r.counts);
        setMine(r.mine);
      },
      () => {},
    );
  }, [code]);

  async function choose(kind: ReactionKind) {
    const next = mine === kind ? null : kind;
    const before = { counts, mine };
    // Update at once (optimistic); roll back if the server refuses.
    const updated = { ...counts };
    if (mine) updated[mine] = Math.max(0, (updated[mine] ?? 1) - 1);
    if (next) updated[next] = (updated[next] ?? 0) + 1;
    setCounts(updated);
    setMine(next);
    setError(false);
    try {
      await setReaction(code, next);
    } catch {
      setCounts(before.counts);
      setMine(before.mine);
      setError(true);
    }
  }

  return (
    <View style={styles.box}>
      <Text style={styles.title}>{t.reactionsTitle}</Text>
      <View style={styles.row} role="radiogroup" aria-label={t.reactionsTitle}>
        {REACTIONS.map(({ kind, emoji }) => (
          <Pressable
            key={kind}
            onPress={() => choose(kind)}
            style={[styles.button, mine === kind && styles.selected]}
            // One choice out of four, so radio semantics. aria-* props: react-native-web ignores accessibilityState.
            role="radio"
            aria-label={t.reactionLabels[kind]}
            aria-checked={mine === kind}>
            <Text style={styles.emoji}>{emoji}</Text>
            <Text style={styles.count}>{counts[kind] ?? 0}</Text>
          </Pressable>
        ))}
      </View>
      {error && <Text style={styles.error}>⚠︎ {t.reactionError}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { padding: space.lg, gap: space.md, backgroundColor: color.surface, borderRadius: radius.md, ...shadow },
  title: { ...font.title, color: color.ink },
  row: { flexDirection: 'row', gap: space.sm },
  button: {
    flex: 1,
    minHeight: 64, // well above the 44 px touch target
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: color.surface,
  },
  selected: { borderColor: color.brand, borderWidth: 2, backgroundColor: color.brandTint },
  emoji: { fontSize: 26, lineHeight: 32 },
  count: { ...font.caption, fontWeight: '700', color: color.ink2 },
  error: { ...font.caption, color: color.danger, backgroundColor: color.dangerTint, padding: space.sm, borderRadius: radius.sm },
});
