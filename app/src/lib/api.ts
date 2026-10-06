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
};

export type Menu = {
  date: string;
  repas: {
    type: string;
    categories: { libelle: string; plats: { code: number; libelle: string }[] }[];
  }[];
};

export type Reviews = {
  count: number;
  average: number | null;
  reviews: { id: number; rating: number; comment: string; created_at: string; mine: boolean }[];
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
  return (await get<Restaurant[]>(`/restaurants/nearby?lat=${lat}&lng=${lng}`)) ?? [];
}

export function fetchTodayMenu(code: number, lang: string) {
  return get<Menu>(`/restaurants/${code}/menu?lang=${lang}`);
}

export async function fetchReviews(code: number) {
  return (await get<Reviews>(`/restaurants/${code}/reviews`))!;
}

async function send(method: 'PUT' | 'DELETE', path: string, body?: unknown) {
  const res = await fetch(API_URL + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
}

export function saveMyReview(code: number, rating: number, comment: string) {
  return send('PUT', `/restaurants/${code}/reviews/mine`, { rating, comment });
}

export function deleteMyReview(code: number) {
  return send('DELETE', `/restaurants/${code}/reviews/mine`);
}
