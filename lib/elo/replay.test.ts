import { describe, expect, it } from "vitest";
import { applyResult } from "./elo";
import { computeRatings, impliedResults, type ReplayEntry, type ReplayMatchup } from "./replay";

const ranked = (albumId: number, year: number, rank: number): ReplayEntry => ({ albumId, year, placement: "ranked", rank });
const mention = (albumId: number, year: number): ReplayEntry => ({
  albumId,
  year,
  placement: "honorable_mention",
  rank: null,
});
const listed = (albumId: number, year: number): ReplayEntry => ({ albumId, year, placement: "listed", rank: null });
const matchup = (id: number, albumAId: number, albumBId: number, result: ReplayMatchup["result"], createdAt = "2026-01-01T00:00:00.000Z"): ReplayMatchup => ({
  id,
  albumAId,
  albumBId,
  result,
  createdAt,
});

describe("impliedResults", () => {
  it("plays ranked over lower ranked and over honorable mentions, and nothing else", () => {
    // Ranks 1, 2 and 4 (a gap), mentions 6 and 5 (listed out of id order), and a listed album.
    const entries = [mention(6, 2000), ranked(4, 2000, 4), listed(7, 2000), ranked(1, 2000, 1), mention(5, 2000), ranked(2, 2000, 2)];
    expect(impliedResults(entries).map((r) => [r.winnerId, r.loserId])).toEqual([
      [1, 2],
      [1, 4],
      [1, 5],
      [1, 6],
      [2, 4],
      [2, 5],
      [2, 6],
      [4, 5],
      [4, 6],
    ]);
  });

  it("goes year by year, ascending, and never across years", () => {
    const entries = [ranked(3, 2001, 1), ranked(4, 2001, 2), ranked(1, 1999, 1), ranked(2, 1999, 2)];
    expect(impliedResults(entries).map((r) => [r.winnerId, r.loserId])).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });
});

describe("computeRatings", () => {
  const entries = [ranked(1, 2000, 1), ranked(2, 2000, 2), ranked(3, 2001, 1), mention(4, 2001), listed(5, 2001)];

  it("rates ranked and honorable mention albums only, from the implied results", () => {
    const { ratings, used } = computeRatings({ entries, matchups: [] });
    expect([...ratings.keys()].sort()).toEqual([1, 2, 3, 4]);
    expect(ratings.get(1)).toBeCloseTo(1516);
    expect(ratings.get(2)).toBeCloseTo(1484);
    expect(ratings.get(3)).toBeCloseTo(1516);
    expect(ratings.get(4)).toBeCloseTo(1484);
    expect(used).toEqual([]);
  });

  it("gives the same ratings for the same inputs", () => {
    const matchups = [matchup(1, 1, 3, "b"), matchup(2, 2, 4, "tie")];
    expect(computeRatings({ entries, matchups })).toEqual(computeRatings({ entries, matchups }));
  });

  it("applies explicit answers after the implied ones, oldest first", () => {
    const matchups = [
      matchup(2, 2, 3, "a", "2026-01-02T00:00:00.000Z"),
      matchup(1, 1, 3, "b", "2026-01-02T00:00:00.000Z"),
      matchup(3, 1, 2, "tie", "2026-01-01T00:00:00.000Z"),
    ];
    const r = new Map([[1, 1516], [2, 1484], [3, 1516], [4, 1484]]);
    const play = (a: number, b: number, result: "a" | "b" | "tie") => {
      const next = applyResult(r.get(a)!, r.get(b)!, result);
      r.set(a, next.a);
      r.set(b, next.b);
    };
    play(1, 2, "tie"); // oldest
    play(1, 3, "b"); // same time, lower id
    play(2, 3, "a");

    const { ratings, used } = computeRatings({ entries, matchups });
    for (const [id, rating] of r) expect(ratings.get(id)).toBeCloseTo(rating, 9);
    expect(used.map((m) => m.id)).toEqual([3, 1, 2]);
  });

  it("skips a matchup with an unrated album, and does not count it as used", () => {
    const matchups = [matchup(1, 1, 5, "a"), matchup(2, 1, 99, "b")];
    const withMatchups = computeRatings({ entries, matchups });
    expect(withMatchups.ratings).toEqual(computeRatings({ entries, matchups: [] }).ratings);
    expect(withMatchups.used).toEqual([]);
  });

  it("brings a skipped matchup back once the album is rated", () => {
    const matchups = [matchup(1, 1, 5, "a")];
    const placed = computeRatings({ entries: [...entries.slice(0, 4), mention(5, 2001)], matchups });
    expect(placed.used).toHaveLength(1);
  });

  it("gives the previous ratings exactly after the last answer is deleted", () => {
    const first = matchup(1, 1, 3, "b", "2026-01-01T00:00:00.000Z");
    const second = matchup(2, 2, 4, "a", "2026-01-02T00:00:00.000Z");
    const before = computeRatings({ entries, matchups: [first] });
    const after = computeRatings({ entries, matchups: [first, second] });
    expect(after.ratings).not.toEqual(before.ratings);
    expect(computeRatings({ entries, matchups: [first, second].slice(0, 1) }).ratings).toEqual(before.ratings);
  });
});
