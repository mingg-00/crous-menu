import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Reviews } from '../../components/Reviews';
import { fetchTodayMenu, type Menu } from '../../lib/api';
import { lang, t } from '../../lib/i18n';

export default function RestaurantMenu() {
  const { code, nom } = useLocalSearchParams<{ code: string; nom?: string }>();
  const [menu, setMenu] = useState<Menu | null>(); // undefined = loading, null = no menu today
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;
    const load = () =>
      fetchTodayMenu(Number(code), lang).then(
        (m) => {
          if (cancelled) return;
          setMenu(m);
          // Translations land in the background within ~10s; poll a few times until they do.
          if (m?.translating && ++attempts < 8) timer = setTimeout(load, 4000);
        },
        () => !cancelled && setError(true),
      );
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [code]);

  return (
    <>
      <Stack.Screen options={{ title: nom ?? '' }} />
      {error ? (
        <Text style={styles.message}>{t.loadError}</Text>
      ) : menu === undefined ? (
        <ActivityIndicator style={styles.message} />
      ) : menu === null ? (
        <Text style={styles.message}>{t.noMenu}</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {menu.translating && <Text style={styles.note}>{t.translating}</Text>}
          {menu.repas.map((meal) => (
            <View key={meal.type}>
              <Text style={styles.meal}>{t.meals[meal.type] ?? meal.type}</Text>
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
          {menu.repas.some((m) => m.type === 'midi') && (
            <Reviews code={Number(code)} returnTo={`/restaurant/${code}?nom=${encodeURIComponent(nom ?? '')}`} />
          )}
        </ScrollView>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16 },
  meal: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  category: { marginBottom: 16 },
  categoryTitle: { fontSize: 15, fontWeight: '600', color: '#444', marginBottom: 4 },
  plat: { fontSize: 16, paddingVertical: 2 },
  message: { padding: 24, textAlign: 'center', color: '#666' },
  note: { color: '#666', marginBottom: 8 },
});
