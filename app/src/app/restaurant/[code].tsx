import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Reviews } from '../../components/Reviews';
import { LoadError, Loading } from '../../components/Status';
import { fetchRestaurant, fetchTodayMenu, type Menu, type RestaurantInfo } from '../../lib/api';
import { lang, t } from '../../lib/i18n';
import { color, font, MAX_WIDTH, radius, shadow, space } from '../../lib/theme';

const menuDate = (iso: string) =>
  new Date(`${iso}T12:00`).toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long' });

// Upstream payment codes; anything else is shown as given.
const paymentName = (p: string) => ({ IZLY: t.izly, Espèces: t.cash })[p] ?? p;

/** Re-runs `load` every 4s while it reports `translating` (translations land within ~10s), a few times at most. */
function pollWhileTranslating<T extends { translating: boolean } | null>(
  load: () => Promise<T>,
  onData: (d: T) => void,
  onError: () => void,
) {
  let cancelled = false;
  let attempts = 0;
  let timer: ReturnType<typeof setTimeout>;
  const run = () =>
    load().then(
      (d) => {
        if (cancelled) return;
        onData(d);
        if (d?.translating && ++attempts < 8) timer = setTimeout(run, 4000);
      },
      () => !cancelled && onError(),
    );
  run();
  return () => {
    cancelled = true;
    clearTimeout(timer);
  };
}

function InfoRow({ icon, label, children }: { icon: string; label?: string; children: React.ReactNode }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoIcon} aria-hidden>
        {icon}
      </Text>
      <View style={styles.infoBody}>
        {label && <Text style={styles.infoLabel}>{label}</Text>}
        {children}
      </View>
    </View>
  );
}

/** Address with its transit stop and directions, opening hours, payment and phone: what a newcomer needs. */
function InfoCard({ info }: { info: RestaurantInfo }) {
  const hasPlace = info.latitude != null && info.longitude != null;
  return (
    <View style={styles.card}>
      {(info.adresse || info.acces.length > 0 || hasPlace) && (
        <InfoRow icon="📍">
          {info.adresse && <Text style={styles.infoText}>{info.adresse}</Text>}
          {info.acces.length > 0 && <Text style={styles.transit}>🚋 {info.acces.join(' · ')}</Text>}
          {hasPlace && (
            <Pressable
              onPress={() =>
                Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${info.latitude},${info.longitude}`)
              }
              accessibilityRole="link"
              style={styles.linkHit}>
              <Text style={styles.link}>{t.directions} ↗</Text>
            </Pressable>
          )}
        </InfoRow>
      )}
      {info.horaires.length > 0 && (
        <InfoRow icon="🕒" label={t.openingHours}>
          {info.horaires.map((h) => (
            <Text key={h} style={styles.infoText}>
              {h}
            </Text>
          ))}
        </InfoRow>
      )}
      {info.paiement.length > 0 && (
        <InfoRow icon="💳" label={t.payment}>
          <Text style={styles.infoText}>{info.paiement.map(paymentName).join(' · ')}</Text>
        </InfoRow>
      )}
      {info.telephone && (
        <InfoRow icon="📞">
          <Pressable
            onPress={() => Linking.openURL(`tel:${info.telephone!.replace(/[^\d+]/g, '')}`)}
            accessibilityRole="link"
            style={styles.linkHit}>
            <Text style={styles.link}>{info.telephone}</Text>
          </Pressable>
        </InfoRow>
      )}
    </View>
  );
}

export default function RestaurantMenu() {
  const { code, nom } = useLocalSearchParams<{ code: string; nom?: string }>();
  const [menu, setMenu] = useState<Menu | null>(); // undefined = loading, null = no menu today
  const [info, setInfo] = useState<RestaurantInfo | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0); // bumped by "Try again"

  useEffect(() => {
    setError(false);
    setMenu(undefined);
    return pollWhileTranslating(() => fetchTodayMenu(Number(code), lang), setMenu, () => setError(true));
  }, [code, attempt]);

  // Secondary: the page still works without it, so a failure here just leaves the card out.
  useEffect(() => pollWhileTranslating(() => fetchRestaurant(Number(code), lang), setInfo, () => {}), [code, attempt]);

  const title = nom || info?.nom || '';
  const hasLunch = !!menu?.repas.some((m) => m.type === 'midi');

  return (
    <>
      <Stack.Screen options={{ title }} />
      {error ? (
        <LoadError onRetry={() => setAttempt((n) => n + 1)} />
      ) : menu === undefined ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {menu && (
            <Text style={styles.date} accessibilityRole="header">
              {menuDate(menu.date)}
            </Text>
          )}
          {menu?.translating && <Text style={styles.note}>{t.translating}</Text>}
          {menu === null && <Text style={styles.message}>{t.noMenu}</Text>}
          {menu?.repas.map((meal) => (
            <View key={meal.type} style={styles.card}>
              <View style={styles.mealHeader}>
                <View style={styles.mealAccent} />
                <Text style={styles.meal} accessibilityRole="header">
                  {t.meals[meal.type] ?? meal.type}
                </Text>
              </View>
              {meal.categories.map((cat) => (
                <View key={cat.libelle} style={styles.category}>
                  <Text style={styles.categoryTitle}>{cat.libelle}</Text>
                  {cat.plats.map((plat) => (
                    <Text key={plat.code} style={styles.plat}>
                      {plat.libelle}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          ))}
          {info && <InfoCard info={info} />}
          {hasLunch && <Reviews code={Number(code)} returnTo={`/restaurant/${code}?nom=${encodeURIComponent(title)}`} />}
        </ScrollView>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', padding: space.lg, gap: space.lg },
  date: { ...font.title, color: color.ink, textTransform: 'capitalize' },
  card: { padding: space.lg, gap: space.lg, backgroundColor: color.surface, borderRadius: radius.md, ...shadow },
  mealHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  mealAccent: { width: 4, height: 22, borderRadius: 2, backgroundColor: color.brand },
  meal: { ...font.heading, fontSize: 22, color: color.ink },
  category: { gap: space.xs },
  categoryTitle: { ...font.overline, color: color.ink3, marginBottom: 2 },
  plat: { ...font.body, color: color.ink },
  message: { ...font.body, padding: space.lg, textAlign: 'center', color: color.ink2 },
  note: {
    ...font.body,
    fontSize: 15,
    color: color.ink2,
    padding: space.md,
    backgroundColor: color.brandTint,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  infoRow: { flexDirection: 'row', gap: space.md },
  infoIcon: { fontSize: 18, lineHeight: 23, width: 24, textAlign: 'center' },
  infoBody: { flex: 1, gap: 2 },
  infoLabel: { ...font.overline, color: color.ink3 },
  infoText: { ...font.body, color: color.ink },
  transit: { ...font.body, fontSize: 15, color: color.ink2 },
  linkHit: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  link: { ...font.bodyStrong, color: color.brandPressed, textDecorationLine: 'underline' },
});
