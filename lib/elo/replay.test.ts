import { describe, expect, it } from "vitest";
import { applyResult } from "./elo";
import { computeRatings, type ReplayMatchup } from "./replay";

const matchup = (
  id: number,
  albumAId: number,
  albumBId: number,
  result: ReplayMatchup["result"],
  createdAt = "2026-01-01T00:00:00.000Z",
): ReplayMatchup => ({ id, albumAId, albumBId, result, createdAt });

describe("computeRatings", () => {
  it("rates every album 1500 when there are no matchups", () => {
    const { ratings, used } = computeRatings({ albumIds: [1, 2, 3], matchups: [] });
    expect([...ratings]).toEqual([
      [1, 1500],
      [2, 1500],
      [3, 1500],
    ]);
    expect(used).toEqual([]);
  });

  it("replays matchups oldest first from 1500, ties on time going to the lower id", () => {
    const matchups = [
      matchup(2, 2, 3, "a", "2026-01-02T00:00:00.000Z"),
      matchup(1, 1, 3, "b", "2026-01-02T00:00:00.000Z"),
      matchup(3, 1, 2, "tie", "2026-01-01T00:00:00.000Z"),
    ];
    const expected = new Map([
      [1, 1500],
      [2, 1500],
      [3, 1500],
    ]);
    const play = (a: number, b: number, result: "a" | "b" | "tie") => {
      const next = applyResult(expected.get(a)!, expected.get(b)!, result);
      expected.set(a, next.a);
      expected.set(b, next.b);
    };
    play(1, 2, "tie"); // oldest
    play(1, 3, "b"); // same time, lower id
    play(2, 3, "a");

    const { ratings, used } = computeRatings({ albumIds: [1, 2, 3], matchups });
    for (const [id, rating] of expected) expect(ratings.get(id)).toBeCloseTo(rating, 9);
    expect(used.map((m) => m.id)).toEqual([3, 1, 2]);
  });

  it.each([
    { name: "an album not in the list on one side", matchups: [matchup(1, 1, 99, "a")] },
    { name: "an album not in the list on the other side", matchups: [matchup(1, 99, 2, "b")] },
  ])("skips a matchup with $name, and leaves it out of used", ({ matchups }) => {
    const withMatchup = computeRatings({ albumIds: [1, 2], matchups });
    expect(withMatchup.ratings).toEqual(computeRatings({ albumIds: [1, 2], matchups: [] }).ratings);
    expect(withMatchup.used).toEqual([]);
  });
});
