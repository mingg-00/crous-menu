import { Platform } from 'react-native';

import type { ReactionCounts, TodaySummary } from './api';

/** Demo mode (web, `?demo=1`): made-up reaction counts for screenshots and portfolio visits, always labelled as such.
 * Never stored, never shown without the banner, so real users are never shown fake opinions. */
export const isDemo = Platform.OS === 'web' && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('demo');

function demoCounts(code: number): ReactionCounts {
  let x = code * 2654435761; // deterministic per restaurant, so the demo looks the same on every visit
  const next = (max: number) => {
    x = (Math.imul(x, 1103515245) + 12345) >>> 0;
    return x % max;
  };
  return { yum: next(16), good: next(9), meh: next(5), bad: next(3) };
}

export function withDemoCounts(summary: TodaySummary, codes: number[]): TodaySummary {
  return Object.fromEntries(codes.map((c) => [String(c), { preview: summary[c]?.preview ?? null, counts: demoCounts(c) }]));
}
