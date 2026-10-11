import { clientId } from './clientId';
import type { ReactionKind } from './reactions';
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
  reviews: { id: number; rating: number; comment: string; day: string; created_at: string; mine: boolean }[];
};

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

/** Returns null on 404 (e.g. no menu that day), throws on other errors. */
async function get<T>(path: string, headers: Record<string, string> = {}): Promise<T | null> {
  const res = await fetch(API_URL + path, { headers: { ...(await authHeader()), ...headers } });
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

/** Throws with the server's string `detail` as message when there is one (e.g. "comment_rejected"). */
async function send(method: 'PUT' | 'POST' | 'DELETE', path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(API_URL + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(await authHeader()), ...headers },
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

export function deleteMyReview(code: number) {
  return send('DELETE', `/restaurants/${code}/reviews/mine`);
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

export type ReactionCounts = Partial<Record<ReactionKind, number>>;

const device = () => ({ 'X-Client-Id': clientId() });

export async function fetchReactions(code: number) {
  return (await get<{ counts: ReactionCounts; mine: ReactionKind | null }>(`/restaurants/${code}/reactions`, device()))!;
}

/** Set (or with null, remove) this device's reaction to today's lunch. */
export function setReaction(code: number, kind: ReactionKind | null) {
  const path = `/restaurants/${code}/reactions/mine`;
  return kind ? send('PUT', path, { kind }, device()) : send('DELETE', path, undefined, device());
}

export type TodaySummary = Record<string, { preview: string | null; counts: ReactionCounts }>;

export async function fetchTodaySummary(codes: number[], lang: string) {
  return (await get<TodaySummary>(`/restaurants/today?codes=${codes.join(',')}&lang=${lang}`)) ?? {};
}
