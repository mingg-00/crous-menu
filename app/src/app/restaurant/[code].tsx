import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { fetchTodayMenu, type Menu } from '../../lib/api';
import { lang, t } from '../../lib/i18n';

export default function RestaurantMenu() {
  const { code, nom } = useLocalSearchParams<{ code: string; nom?: string }>();
  const [menu, setMenu] = useState<Menu | null>(); // undefined = loading, null = no menu today
  const [error, setError] = useState(false);

  useEffect(() => {
    fetchTodayMenu(Number(code), lang).then(setMenu, () => setError(true));
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
});
