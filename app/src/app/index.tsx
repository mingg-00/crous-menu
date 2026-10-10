import * as Location from 'expo-location';
import { Link } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { fetchNearby, type Restaurant } from '../lib/api';
import { t } from '../lib/i18n';

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
  const show = useCallback(async (coords: Coords | null, noteIfDefault: string) => {
    let list = coords ? await fetchNearby(coords.latitude, coords.longitude) : [];
    let message: string | null = null;
    if (!coords || (list[0]?.distance_km ?? Infinity) > NEAR_KM) {
      list = await fetchNearby(TALENCE.latitude, TALENCE.longitude);
      message = coords ? t.farFromCrous : noteIfDefault;
    }
    setRestaurants(list);
    setNote(message);
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

  return (
    <FlatList
      data={restaurants}
      keyExtractor={(r) => String(r.code)}
      refreshing={loading}
      onRefresh={load}
      ListHeaderComponent={
        note ? (
          <View style={styles.note}>
            <Text style={styles.noteText}>{note}</Text>
            {detail && <Text style={styles.detail}>{detail}</Text>}
            {canRetry && (
              <Pressable onPress={load} accessibilityRole="button" hitSlop={8}>
                <Text style={styles.retry}>{t.retry}</Text>
              </Pressable>
            )}
          </View>
        ) : null
      }
      ListEmptyComponent={error ? <Text style={styles.message}>{error}</Text> : null}
      ListFooterComponent={
        <Link href="/privacy" style={styles.privacy}>
          {t.privacy}
        </Link>
      }
      renderItem={({ item }) => (
        <Link href={{ pathname: '/restaurant/[code]', params: { code: item.code, nom: item.nom } }} asChild>
          <Pressable style={styles.row}>
            <Text style={styles.name}>{item.nom}</Text>
            <Text style={styles.meta}>
              {formatDistance(item.distance_km)} · {item.type}
            </Text>
          </Pressable>
        </Link>
      )}
    />
  );
}

const styles = StyleSheet.create({
  row: { padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#ccc' },
  name: { fontSize: 17, fontWeight: '600' },
  meta: { marginTop: 4, color: '#666' },
  message: { padding: 24, textAlign: 'center', color: '#666' },
  note: { padding: 12, gap: 6, backgroundColor: '#f6f6f6' },
  noteText: { color: '#666' },
  detail: { color: '#999', fontSize: 12 },
  retry: { color: '#0a7ea4', fontSize: 15 },
  privacy: { padding: 16, color: '#666', fontSize: 13, textAlign: 'center', textDecorationLine: 'underline' },
});
