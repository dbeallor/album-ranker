export const START_RATING = 1500;
export const K = 32;

export type EloResult = "a" | "b" | "tie";

/** Chance that A beats B. */
export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

/** The new ratings after A plays B. A gains what B loses. Ratings stay unrounded. */
export function applyResult(ratingA: number, ratingB: number, result: EloResult): { a: number; b: number } {
  const score = result === "a" ? 1 : result === "tie" ? 0.5 : 0;
  const delta = K * (score - expectedScore(ratingA, ratingB));
  return { a: ratingA + delta, b: ratingB - delta };
}
