import { START_RATING } from "./elo";

const SCALE = 100;

/** `1500 + 100 * ln(1 + excess / 100)`, where excess is the sum of each album's points above 1500; undefined for an artist with no albums. */
export function artistScore(ratings: number[]): number | undefined {
  if (ratings.length === 0) return undefined;
  const excess = ratings.reduce((sum, rating) => sum + Math.max(0, rating - START_RATING), 0);
  return START_RATING + SCALE * Math.log(1 + excess / SCALE);
}
