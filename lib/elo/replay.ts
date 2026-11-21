import { applyResult, START_RATING, type EloResult } from "./elo";

export type ReplayEntry = {
  albumId: number;
  year: number;
  placement: "ranked" | "honorable_mention" | "listed";
  rank: number | null;
};

export type ReplayMatchup = {
  id: number;
  albumAId: number;
  albumBId: number;
  result: EloResult;
  createdAt: string;
};

export type ImpliedResult = { winnerId: number; loserId: number };

/**
 * The results a year's placements imply, in replay order: years ascending; within a year each ranked album
 * (rank 1 first) beats the ranked albums below it, then the honorable mentions (album id order).
 * Honorable mentions and listed albums don't play each other.
 */
export function impliedResults(entries: ReplayEntry[]): ImpliedResult[] {
  const years = [...new Set(entries.map((entry) => entry.year))].sort((a, b) => a - b);
  const results: ImpliedResult[] = [];
  for (const year of years) {
    const inYear = entries.filter((entry) => entry.year === year);
    const ranked = inYear
      .filter((entry) => entry.placement === "ranked")
      .sort((a, b) => a.rank! - b.rank!);
    const mentions = inYear
      .filter((entry) => entry.placement === "honorable_mention")
      .sort((a, b) => a.albumId - b.albumId);
    ranked.forEach((winner, i) => {
      for (const loser of [...ranked.slice(i + 1), ...mentions]) {
        results.push({ winnerId: winner.albumId, loserId: loser.albumId });
      }
    });
  }
  return results;
}

/**
 * Replays the implied results, then the explicit matchups oldest first (created at, then id), from 1500.
 * A matchup with an unrated album is skipped, so `used` lists only the matchups that counted.
 */
export function computeRatings(input: { entries: ReplayEntry[]; matchups: ReplayMatchup[] }): {
  ratings: Map<number, number>;
  used: ReplayMatchup[];
} {
  const ratings = new Map<number, number>();
  for (const entry of input.entries) {
    if (entry.placement !== "listed") ratings.set(entry.albumId, START_RATING);
  }

  const play = (aId: number, bId: number, result: EloResult) => {
    const next = applyResult(ratings.get(aId)!, ratings.get(bId)!, result);
    ratings.set(aId, next.a);
    ratings.set(bId, next.b);
  };

  for (const { winnerId, loserId } of impliedResults(input.entries)) play(winnerId, loserId, "a");

  const sorted = [...input.matchups].sort(
    (a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0) || a.id - b.id,
  );
  const used: ReplayMatchup[] = [];
  for (const matchup of sorted) {
    if (!ratings.has(matchup.albumAId) || !ratings.has(matchup.albumBId)) continue;
    play(matchup.albumAId, matchup.albumBId, matchup.result);
    used.push(matchup);
  }
  return { ratings, used };
}
