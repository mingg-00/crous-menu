const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8100';

export type Restaurant = {
  code: number;
  nom: string;
  type: string | null;
  adresse: string | null;
  horaires: string[];
  image_url: string | null;
  distance_km: number;
};

export type Menu = {
  date: string;
  repas: {
    type: string;
    categories: { libelle: string; plats: { code: number; libelle: string }[] }[];
  }[];
};

/** Returns null on 404 (e.g. no menu that day), throws on other errors. */
async function get<T>(path: string): Promise<T | null> {
  const res = await fetch(API_URL + path);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function fetchNearby(lat: number, lng: number) {
  return (await get<Restaurant[]>(`/restaurants/nearby?lat=${lat}&lng=${lng}`)) ?? [];
}

export function fetchTodayMenu(code: number, lang: string) {
  return get<Menu>(`/restaurants/${code}/menu?lang=${lang}`);
}
