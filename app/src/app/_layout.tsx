import { Stack } from 'expo-router';

import { t } from '../lib/i18n';

export default function Layout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: t.nearby }} />
    </Stack>
  );
}
