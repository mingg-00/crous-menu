import * as Location from 'expo-location';
import { Link, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { RestaurantMap } from '../components/RestaurantMap';
import { fetchNearby, fetchTodaySummary, type Restaurant, type TodaySummary } from '../lib/api';
import { isDemo, withDemoCounts } from '../lib/demo';
import { lang, t } from '../lib/i18n';
import { REACTIONS } from '../lib/reactions';
import { color, font, MAX_WIDTH, radius, shadow, space } from '../lib/theme';

/** "😋 12  🙂 3", most frequent first; empty when nobody reacted yet. */
function reactionLine(counts: TodaySummary[string]['counts'] | undefined) {
  if (!counts) return '';
  return REACTIONS.filter(({ kind }) => counts[kind])
    .sort((a, b) => (counts[b.kind] ?? 0) - (counts[a.kind] ?? 0))
    .map(({ kind, emoji }) => `${emoji} ${counts[kind]}`)
    .join('  ');
}

function formatDistance(km: number) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

// Shown whenever there is no usable position: location denied/unavailable, still being asked, or far from any Crous.
const TALENCE = { latitude: 44.8065, longitude: -0.6032 };
const QUICK_LOCATION_MS = 1500; // already-allowed locations resolve well within this; don't make the page wait longer
const NEAR_KM = 100; // nearest restaurant farther than this: the visitor isn't near a Crous, show the demo area

type Coords = { latitude: number; longitude: number };
type Located = { coords: Coords } | { failure: 'denied' | 'unavailable'; detail?: string };

const GIVE_UP_MS = 2 * 60 * 1000; // stop watching eventually so the note doesn't say "finding" forever

// Web: watchPosition delivers the first fix whenever the OS has one. There is deliberately no short timeout: a Mac
// locating over Wi-Fi can take well over 30s (seen in the field: two getCurrentPosition calls timed out at 10s
// and 20s while an untimed call succeeded), and the list already shows Talence meanwhile. Transient errors
// ("position unavailable", per-fix timeouts) keep the watch going; only a denial stops it at once.
// (expo-location's web version isn't used: it asks for permission with an untimed request, then asks again.)
function locateWeb(): Promise<Located> {
  if (!('geolocation' in navigator)) return Promise.resolve({ failure: 'unavailable', detail: 'no geolocation API' });
  return new Promise((resolve) => {
    let lastError = '';
    const finish = (result: Located) => {
      navigator.geolocation.clearWatch(id);
      clearTimeout(giveUp);
      if ('failure' in result) console.warn('geolocation failed:', result.detail);
      resolve(result);
    };
    const id = navigator.geolocation.watchPosition(
      (p) => finish({ coords: p.coords }),
      (e) => {
        lastError = `${e.code}: ${e.message}`;
        if (e.code === e.PERMISSION_DENIED) finish({ failure: 'denied', detail: lastError });
      },
      { maximumAge: 5 * 60 * 1000 },
    );
    const giveUp = setTimeout(() => finish({ failure: 'unavailable', detail: lastError || 'no position after 2 min' }), GIVE_UP_MS);
  });
}

async function locateNative(): Promise<Located> {
  try {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    if (!granted) return { failure: 'denied' };
    return { coords: (await Location.getCurrentPositionAsync()).coords };
  } catch {
    return { failure: 'unavailable' };
  }
}

const locate = Platform.OS === 'web' ? locateWeb : locateNative;

export default function Nearby() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const [detail, setDetail] = useState<string | null>(null); // browser's reason when the position could not be found

  // Restaurants sorted from `coords`; from Talence (with a note) when the visitor is nowhere near a Crous.
  const [center, setCenter] = useState<Coords>(TALENCE); // map center: the position the list is sorted from
  const [showUser, setShowUser] = useState(false);

  const show = useCallback(async (coords: Coords | null, noteIfDefault: string) => {
    let list = coords ? await fetchNearby(coords.latitude, coords.longitude) : [];
    let message: string | null = null;
    if (!coords || (list[0]?.distance_km ?? Infinity) > NEAR_KM) {
      list = await fetchNearby(TALENCE.latitude, TALENCE.longitude);
      message = coords ? t.farFromCrous : noteIfDefault;
    }
    setRestaurants(list);
    setNote(message);
    const usedOwnPosition = !!coords && !message;
    setCenter(usedOwnPosition ? coords : TALENCE);
    setShowUser(usedOwnPosition);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCanRetry(false);
    setDetail(null);
    try {
      // Never block the list on the permission prompt: show Talence at once, re-sort when the position arrives.
      const state: { result: Located | null } = { result: null };
      const located = locate().then((r) => (state.result = r));
      const quick = await Promise.race([located, new Promise<null>((r) => setTimeout(() => r(null), QUICK_LOCATION_MS))]);
      const whyDefault = (r: Located | null) =>
        r === null ? t.locating : 'failure' in r && r.failure === 'unavailable' ? t.locationUnavailable : t.usingDefaultLocation;
      await show(quick && 'coords' in quick ? quick.coords : null, whyDefault(state.result));
      setLoading(false);
      let final = quick;
      if (!final) {
        final = await located;
        if ('coords' in final) await show(final.coords, t.usingDefaultLocation);
        else setNote(whyDefault(final));
      }
      setCanRetry('failure' in final);
      setDetail('failure' in final && final.failure === 'unavailable' ? (final.detail ?? null) : null);
    } catch {
      setError(t.loadError);
    } finally {
      setLoading(false);
    }
  }, [show]);

  useEffect(() => {
    load();
  }, [load]);

  const openRestaurant = useCallback(
    (r: Restaurant) => router.push({ pathname: '/restaurant/[code]', params: { code: r.code, nom: r.nom } }),
    [],
  );

  // Today's lunch preview and reactions per card, fetched after the list shows so it never waits on them.
  const [summary, setSummary] = useState<TodaySummary>({});
  useEffect(() => {
    if (!restaurants.length) return;
    let cancelled = false;
    const codes = restaurants.map((r) => r.code);
    fetchTodaySummary(codes, lang).then((s) => !cancelled && setSummary(isDemo ? withDemoCounts(s, codes) : s), () => {});
    return () => {
      cancelled = true;
    };
  }, [restaurants]);

  return (
    <FlatList
      data={restaurants}
      keyExtractor={(r) => String(r.code)}
      refreshing={loading}
      onRefresh={load}
      contentContainerStyle={styles.content}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.heading} accessibilityRole="header">
            {t.nearby}
          </Text>
          {isDemo && <Text style={styles.demo}>{t.demoBanner}</Text>}
          {Platform.OS === 'web' && restaurants.length > 0 && (
            <RestaurantMap center={center} showUser={showUser} restaurants={restaurants} summary={summary} onSelect={openRestaurant} />
          )}
          {note && (
            <View style={styles.note}>
              <Text style={styles.noteText}>{note}</Text>
              {detail && <Text style={styles.detail}>{detail}</Text>}
              {canRetry && (
                <Pressable onPress={load} accessibilityRole="button" hitSlop={8} style={styles.retry}>
                  <Text style={styles.retryText}>{t.retry}</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      }
      ListEmptyComponent={error ? <Text style={styles.message}>{error}</Text> : null}
      ListFooterComponent={
        <View style={styles.footer}>
          <Text style={styles.unofficial}>{t.unofficial}</Text>
          <Link href="/privacy" style={styles.privacy}>
            {t.privacy}
          </Link>
        </View>
      }
      renderItem={({ item }) => (
        // Card style on Link: asChild forwards it to the Pressable.
        <Link href={{ pathname: '/restaurant/[code]', params: { code: item.code, nom: item.nom } }} asChild style={styles.card}>
          <Pressable>
            <View style={styles.cardBody}>
              <Text style={styles.name}>{item.nom}</Text>
              <View style={styles.meta}>
                <Text style={styles.distance}>{formatDistance(item.distance_km)}</Text>
                {item.type && <Text style={styles.type}>{item.type}</Text>}
                {!!reactionLine(summary[item.code]?.counts) && (
                  <Text style={styles.reactions}>{reactionLine(summary[item.code]?.counts)}</Text>
                )}
              </View>
              {summary[item.code]?.preview && (
                <Text style={styles.preview} numberOfLines={1}>
                  {summary[item.code]?.preview}
                </Text>
              )}
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        </Link>
      )}
    />
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', padding: space.lg, gap: space.md },
  header: { gap: space.md, marginBottom: space.xs },
  heading: { ...font.heading, color: color.ink },
  demo: { ...font.caption, fontWeight: '700', color: color.ink, backgroundColor: '#FFF4C2', padding: space.sm, borderRadius: radius.sm },
  note: { padding: space.md, gap: space.sm, backgroundColor: color.brandTint, borderRadius: radius.md },
  noteText: { ...font.body, fontSize: 15, color: color.ink2 },
  detail: { ...font.caption, color: color.ink3 },
  retry: {
    alignSelf: 'flex-start',
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    backgroundColor: color.brand,
  },
  retryText: { ...font.bodyStrong, fontSize: 15, color: '#fff' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: space.lg,
    backgroundColor: color.surface,
    borderRadius: radius.md,
    ...shadow,
  },
  cardBody: { flex: 1, gap: space.sm },
  name: { ...font.title, fontSize: 17, color: color.ink },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  distance: {
    ...font.caption,
    fontWeight: '700',
    color: color.brandPressed,
    backgroundColor: color.brandTint,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  type: { ...font.caption, color: color.ink3 },
  reactions: { ...font.caption, color: color.ink2 },
  preview: { ...font.body, fontSize: 15, color: color.ink2 },
  chevron: { fontSize: 28, color: color.ink3, marginLeft: space.sm },
  message: { ...font.body, padding: space.xl, textAlign: 'center', color: color.ink2 },
  footer: { padding: space.lg, gap: space.sm, alignItems: 'center' },
  unofficial: { ...font.caption, color: color.ink3, textAlign: 'center' },
  privacy: { ...font.caption, color: color.ink3, textAlign: 'center', textDecorationLine: 'underline' },
});
