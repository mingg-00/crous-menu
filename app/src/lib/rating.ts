import type { Rating } from './api';
import { lang, t } from './i18n';

const oneDecimal = (n: number) => n.toLocaleString(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** "★ 4,2 (12)", decimal separator in the reader's language. */
export const ratingText = (r: NonNullable<Rating>) => `★ ${oneDecimal(r.average)} (${r.count})`;

/** What screen readers say instead of the star glyph, e.g. "Rated 4.2 out of 5 (12 reviews)". */
export const ratingLabel = (r: NonNullable<Rating>) =>
  t.ratingLabel.replace('{avg}', oneDecimal(r.average)).replace('{count}', String(r.count));
