export type ReactionKind = 'yum' | 'good' | 'meh' | 'bad';

// Order is display order. The server stores the kind, so the emoji can change without a migration.
export const REACTIONS: { kind: ReactionKind; emoji: string }[] = [
  { kind: 'yum', emoji: '😋' },
  { kind: 'good', emoji: '🙂' },
  { kind: 'meh', emoji: '😐' },
  { kind: 'bad', emoji: '😣' },
];
