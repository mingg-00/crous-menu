import { supabase } from './supabase';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8100';

export type Restaurant = {
  code: number;
  nom: string;
  type: string | null;
  adresse: string | null;
  horaires: string[];
  image_url: string | null;
  distance_km: number;
  latitude: number;
  longitude: number;
};

export type Menu = {
  date: string;
  repas: {
    type: string;
    categories: { libelle: string; plats: { code: number; libelle: string }[] }[];
  }[];
  translating: boolean; // some lines still French; the server is translating them in the background
};

export type Reviews = {
  count: number;
  average: number | null;
  today: string; // server's date (Paris); only a review of this day can be edited or deleted
  reviews: {
    id: number;
    rating: number;
    comment: string;
    translation?: string | null; // comment in the viewer's language; null when there is nothing to translate
    day: string;
    created_at: string;
    mine: boolean;
  }[];
  translating: boolean; // some comments not translated yet; the server is translating them in the background
};

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

/** Returns null on 404 (e.g. no menu that day), throws on other errors. */
async function get<T>(path: string): Promise<T | null> {
  const res = await fetch(API_URL + path, { headers: await authHeader() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function fetchNearby(lat: number, lng: number) {
  // Nearest 10, or the whole city when it has more (Bordeaux: 15 within 10 km).
  return (await get<Restaurant[]>(`/restaurants/nearby?lat=${lat}&lng=${lng}&within_km=20`)) ?? [];
}

/** Getting there and paying: address, translated opening hours, transit, payment methods, phone. */
export type RestaurantInfo = {
  code: number;
  nom: string;
  adresse: string | null;
  latitude: number | null;
  longitude: number | null;
  horaires: string[];
  acces: string[];
  paiement: string[];
  telephone: string | null;
  translating: boolean; // opening hours still French; the server is translating them in the background
};

export function fetchRestaurant(code: number, lang: string) {
  return get<RestaurantInfo>(`/restaurants/${code}?lang=${lang}`);
}

export function fetchTodayMenu(code: number, lang: string) {
  return get<Menu>(`/restaurants/${code}/menu?lang=${lang}`);
}

export async function fetchReviews(code: number, lang: string) {
  return (await get<Reviews>(`/restaurants/${code}/reviews?lang=${lang}`))!;
}

/** Throws with the server's string `detail` as message when there is one (e.g. "comment_rejected"). */
async function send(method: 'PUT' | 'POST' | 'DELETE', path: string, body?: unknown) {
  const res = await fetch(API_URL + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().then((b) => b.detail, () => null);
    throw new Error(typeof detail === 'string' ? detail : `API ${res.status}`);
  }
}

export function saveMyReview(code: number, rating: number, comment: string) {
  return send('PUT', `/restaurants/${code}/reviews/mine`, { rating, comment });
}

export function deleteMyReview(id: number) {
  return send('DELETE', `/reviews/${id}`);
}

export function reportReview(id: number, reason: 'spam' | 'offensive') {
  return send('POST', `/reviews/${id}/report`, { reason });
}

export function blockAuthor(id: number) {
  return send('POST', `/reviews/${id}/block-author`);
}

export function deleteAccount() {
  return send('DELETE', '/me');
}

/** Lunch star rating over all days; null until someone reviews. */
export type Rating = { average: number; count: number } | null;

export type TodaySummary = Record<string, { preview: string | null; rating: Rating; translating: boolean }>;

export async function fetchTodaySummary(codes: number[], lang: string) {
  return (await get<TodaySummary>(`/restaurants/today?codes=${codes.join(',')}&lang=${lang}`)) ?? {};
}
