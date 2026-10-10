import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Reviews } from '../../components/Reviews';
import { fetchTodayMenu, type Menu } from '../../lib/api';
import { lang, t } from '../../lib/i18n';
import { color, font, MAX_WIDTH, radius, shadow, space } from '../../lib/theme';

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
        <ActivityIndicator style={styles.message} color={color.brand} />
      ) : menu === null ? (
        <Text style={styles.message}>{t.noMenu}</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {menu.translating && <Text style={styles.note}>{t.translating}</Text>}
          {menu.repas.map((meal) => (
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
          {menu.repas.some((m) => m.type === 'midi') && (
            <Reviews code={Number(code)} returnTo={`/restaurant/${code}?nom=${encodeURIComponent(nom ?? '')}`} />
          )}
        </ScrollView>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', padding: space.lg, gap: space.lg },
  card: { padding: space.lg, gap: space.lg, backgroundColor: color.surface, borderRadius: radius.md, ...shadow },
  mealHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  mealAccent: { width: 4, height: 22, borderRadius: 2, backgroundColor: color.brand },
  meal: { ...font.heading, fontSize: 22, color: color.ink },
  category: { gap: space.xs },
  categoryTitle: { ...font.overline, color: color.ink3, marginBottom: 2 },
  plat: { ...font.body, color: color.ink },
  message: { ...font.body, padding: space.xl, textAlign: 'center', color: color.ink2 },
  note: {
    ...font.body,
    fontSize: 15,
    color: color.ink2,
    padding: space.md,
    backgroundColor: color.brandTint,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
});
