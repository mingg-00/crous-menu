import * as Location from 'expo-location';
import { Link } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text } from 'react-native';

import { fetchNearby, type Restaurant } from '../lib/api';
import { t } from '../lib/i18n';

function formatDistance(km: number) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

// Fallback when location is denied/unavailable (common on the web): the Talence campus, where the app started.
const TALENCE = { latitude: 44.8065, longitude: -0.6032 };

async function currentCoords() {
  try {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    return granted ? (await Location.getCurrentPositionAsync()).coords : TALENCE;
  } catch {
    return TALENCE;
  }
}

export default function Nearby() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [usingDefault, setUsingDefault] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const coords = await currentCoords();
      setUsingDefault(coords === TALENCE);
      setRestaurants(await fetchNearby(coords.latitude, coords.longitude));
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
      ListHeaderComponent={usingDefault ? <Text style={styles.note}>{t.usingDefaultLocation}</Text> : null}
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
