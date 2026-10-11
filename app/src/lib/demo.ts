import { Platform } from 'react-native';

import type { Rating, TodaySummary } from './api';

/** Demo mode (web, `?demo=1`): made-up star ratings for screenshots and portfolio visits, always labelled as such.
 * Never stored, never shown without the banner, so real users are never shown fake opinions. */
export const isDemo = Platform.OS === 'web' && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('demo');

function demoRating(code: number): Rating {
  let x = code * 2654435761; // deterministic per restaurant, so the demo looks the same on every visit
  const next = (max: number) => {
    x = (Math.imul(x, 1103515245) + 12345) >>> 0;
    return x % max;
  };
  return { average: (30 + next(20)) / 10, count: 3 + next(38) }; // 3.0–4.9 stars from 3–40 reviews
}

export function withDemoRatings(summary: TodaySummary, codes: number[]): TodaySummary {
  return Object.fromEntries(codes.map((c) => [String(c), { preview: summary[c]?.preview ?? null, rating: demoRating(c) }]));
}
