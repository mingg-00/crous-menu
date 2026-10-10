import * as Location from 'expo-location';
import { Link } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text } from 'react-native';

import { fetchNearby, type Restaurant } from '../lib/api';
import { t } from '../lib/i18n';

function formatDistance(km: number) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

// Fallback when location is denied, unavailable, slow or far from any Crous: the Talence campus, where the app started.
const TALENCE = { latitude: 44.8065, longitude: -0.6032 };
const LOCATION_TIMEOUT_MS = 6000; // a pending permission prompt or a stuck GPS fix must not leave the list empty
const NEAR_KM = 100; // nearest restaurant farther than this: the visitor isn't near a Crous, show the demo area

// ponytail: if the user allows location after the timeout we keep Talence until the next load.
async function currentCoords() {
  const locate = async () => {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    return granted ? (await Location.getCurrentPositionAsync()).coords : null;
  };
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), LOCATION_TIMEOUT_MS));
  try {
    return (await Promise.race([locate(), timeout])) ?? TALENCE;
  } catch {
    return TALENCE;
  }
}

export default function Nearby() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let coords = await currentCoords();
      let list = await fetchNearby(coords.latitude, coords.longitude);
      let message = coords === TALENCE ? t.usingDefaultLocation : null;
      if (coords !== TALENCE && (list[0]?.distance_km ?? Infinity) > NEAR_KM) {
        coords = TALENCE;
        list = await fetchNearby(coords.latitude, coords.longitude);
        message = t.farFromCrous;
      }
      setRestaurants(list);
      setNote(message);
    } catch {
      setError(t.loadError);
    } finally {
      setLoading(false);
    }
  }, []);

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
