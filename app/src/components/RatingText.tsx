import { StyleSheet, Text, type TextStyle } from 'react-native';

import type { Rating } from '../lib/api';
import { ratingLabel, ratingText } from '../lib/rating';
import { color } from '../lib/theme';

/** "★ 4,2 (12)" with the star in the rating color everywhere; read out as a sentence by screen readers. */
export function RatingText({ rating, style }: { rating: NonNullable<Rating>; style?: TextStyle }) {
  const [star, rest] = [ratingText(rating).slice(0, 1), ratingText(rating).slice(1)];
  return (
    <Text style={style} accessibilityLabel={ratingLabel(rating)}>
      <Text style={styles.star}>{star}</Text>
      {rest}
    </Text>
  );
}

const styles = StyleSheet.create({ star: { color: color.star } });
