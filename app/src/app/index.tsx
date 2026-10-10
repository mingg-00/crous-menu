import * as Location from 'expo-location';
import { Link } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text } from 'react-native';

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

/** The user's position, or null if denied/unavailable. Waits as long as the user needs to answer the permission prompt. */
async function locate(): Promise<Coords | null> {
  try {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    return granted ? (await Location.getCurrentPositionAsync()).coords : null;
  } catch {
    return null;
  }
}

export default function Nearby() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState<string | null>(null);

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
    try {
      // Never block the list on the permission prompt: show Talence at once, re-sort when the position arrives.
      let settled = false;
      const located = locate().then((c) => ((settled = true), c));
      const quick = await Promise.race([located, new Promise<null>((r) => setTimeout(() => r(null), QUICK_LOCATION_MS))]);
      await show(quick, settled ? t.usingDefaultLocation : t.locating);
      setLoading(false);
      if (!quick && !settled) {
        const later = await located;
        if (later) await show(later, t.usingDefaultLocation);
        else setNote(t.usingDefaultLocation);
      }
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
      ListHeaderComponent={note ? <Text style={styles.note}>{note}</Text> : null}
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
  note: { padding: 12, color: '#666', backgroundColor: '#f6f6f6' },
  privacy: { padding: 16, color: '#666', fontSize: 13, textAlign: 'center', textDecorationLine: 'underline' },
});
