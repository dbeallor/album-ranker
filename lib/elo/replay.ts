import { applyResult, START_RATING, type EloResult } from "./elo";

export type ReplayMatchup = {
  id: number;
  albumAId: number;
  albumBId: number;
  result: EloResult;
  createdAt: string;
};

/**
 * Starts every album id at 1500, then replays the matchups oldest first (created at, then id).
 * A matchup with an album not in `albumIds` is skipped, so `used` lists only the matchups that counted.
 */
export function computeRatings(input: { albumIds: number[]; matchups: ReplayMatchup[] }): {
  ratings: Map<number, number>;
  used: ReplayMatchup[];
} {
  const ratings = new Map<number, number>();
  for (const albumId of input.albumIds) ratings.set(albumId, START_RATING);

  const sorted = [...input.matchups].sort(
    (a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0) || a.id - b.id,
  );
  const used: ReplayMatchup[] = [];
  for (const matchup of sorted) {
    if (!ratings.has(matchup.albumAId) || !ratings.has(matchup.albumBId)) continue;
    const next = applyResult(ratings.get(matchup.albumAId)!, ratings.get(matchup.albumBId)!, matchup.result);
    ratings.set(matchup.albumAId, next.a);
    ratings.set(matchup.albumBId, next.b);
    used.push(matchup);
  }
  return { ratings, used };
}
