import { START_RATING } from "./elo";

/** `(sum of ratings + 1500) / (album count + 1)`, or undefined for an artist with no rated albums. */
export function artistScore(ratings: number[]): number | undefined {
  if (ratings.length === 0) return undefined;
  return (ratings.reduce((sum, rating) => sum + rating, 0) + START_RATING) / (ratings.length + 1);
}
