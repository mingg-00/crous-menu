import type { Restaurant, TodaySummary } from '../lib/api';

export type RestaurantMapProps = {
  center: { latitude: number; longitude: number };
  showUser: boolean;
  restaurants: Restaurant[];
  summary: TodaySummary;
  onSelect: (r: Restaurant) => void;
};

// ponytail: web only for now (RestaurantMap.web.tsx). A native map needs a development build (expo-maps or
// MapLibre native); add it with the store releases. Until then the native app shows the list alone.
export function RestaurantMap(_: RestaurantMapProps) {
  return null;
}
