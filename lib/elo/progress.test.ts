import { describe, expect, it } from "vitest";
import { computeProgress, formatPercent, PRIOR_SPREAD, TARGET_CONFIDENCE } from "./progress";

const Q = Math.log(10) / 400;

function ratingsOf(count: number, rating = 1500, firstId = 1): Map<number, number> {
  return new Map(Array.from({ length: count }, (_, index) => [firstId + index, rating]));
}

/** `rounds` rounds of a ring: in round r each album i meets album i + r, so every album plays 2 per round. */
function evenMatchups(count: number, rounds: number) {
  const matchups: { albumAId: number; albumBId: number }[] = [];
  for (let round = 1; round <= rounds; round++) {
    for (let i = 0; i < count; i++) matchups.push({ albumAId: i + 1, albumBId: ((i + round) % count) + 1 });
  }
  return matchups;
}

const progressOf = (count: number, rounds: number) => computeProgress(ratingsOf(count), evenMatchups(count, rounds))!;

/** The closed form for two albums at 1500 that have played each other `k` times. */
function twoAlbumConfidence(k: number): number {
  const variance = 1 / (1 / PRIOR_SPREAD ** 2 + (k * Q ** 2) / 4);
  const s2 = 2 * variance;
  const tau2 = 2 * PRIOR_SPREAD ** 2 - s2;
  return 0.5 + Math.atan(Math.sqrt(tau2 / s2)) / Math.PI;
}

describe("computeProgress", () => {
  it.each<[string, () => void]>([
    [
      "returns null with no albums and with one album",
      () => {
        expect(computeProgress(new Map(), [])).toBeNull();
        expect(computeProgress(ratingsOf(1), [])).toBeNull();
      },
    ],
    [
      "with no matchups the confidence is 50%, the percent 0 and the goal about 14.3 per album",
      () => {
        for (const count of [10, 100]) {
          const progress = computeProgress(ratingsOf(count), [])!;
          expect(progress.confidence).toBe(0.5);
          expect(progress.percent).toBe(0);
          expect(progress.played).toBe(0);
          expect(progress.goal).toBe(progress.remaining);
          expect(progress.albumCount).toBe(count);
          expect(progress.remaining / count).toBeGreaterThanOrEqual(14.2);
          expect(progress.remaining / count).toBeLessThanOrEqual(14.4);
        }
      },
    ],
    [
      "two albums match the closed form",
      () => {
        for (const k of [0, 1, 5, 20]) {
          const used = Array.from({ length: k }, () => ({ albumAId: 1, albumBId: 2 }));
          const progress = computeProgress(ratingsOf(2), used)!;
          expect(progress.played).toBe(k);
          expect(progress.confidence).toBeCloseTo(twoAlbumConfidence(k), 10);
        }
      },
    ],
    [
      "more matchups raise the confidence and the percent and lower the matchups remaining",
      () => {
        const few = progressOf(10, 1);
        const more = progressOf(10, 3);
        expect(more.confidence).toBeGreaterThan(few.confidence);
        expect(more.percent).toBeGreaterThan(few.percent);
        expect(more.remaining).toBeLessThan(few.remaining);
      },
    ],
    [
      "at or above the target nothing remains and the percent is exactly 100",
      () => {
        const progress = progressOf(10, 30);
        expect(progress.confidence).toBeGreaterThanOrEqual(TARGET_CONFIDENCE);
        expect(progress.remaining).toBe(0);
        expect(progress.goal).toBe(progress.played);
        expect(progress.percent).toBe(100);
      },
    ],
    [
      "adding an album with no matchups lowers the confidence and the percent and raises the goal",
      () => {
        const used = evenMatchups(10, 3);
        const before = computeProgress(ratingsOf(10), used)!;
        const after = computeProgress(ratingsOf(11), used)!;
        expect(after.confidence).toBeLessThan(before.confidence);
        expect(after.percent).toBeLessThan(before.percent);
        expect(after.goal).toBeGreaterThan(before.goal);
      },
    ],
    [
      "the same matchups concentrated on two of ten albums score lower than spread evenly",
      () => {
        const concentrated = computeProgress(
          ratingsOf(10),
          Array.from({ length: 20 }, () => ({ albumAId: 1, albumBId: 2 })),
        )!;
        const spread = progressOf(10, 2);
        expect(concentrated.played).toBe(spread.played);
        expect(concentrated.confidence).toBeLessThan(spread.confidence);
      },
    ],
    [
      "a lopsided matchup adds less confidence than an even one",
      () => {
        const used = Array.from({ length: 5 }, () => ({ albumAId: 1, albumBId: 2 }));
        const even = computeProgress(new Map([[1, 1500], [2, 1500]]), used)!;
        const lopsided = computeProgress(new Map([[1, 1500], [2, 1900]]), used)!;
        expect(lopsided.confidence).toBeGreaterThan(0.5);
        expect(lopsided.confidence).toBeLessThan(even.confidence);
      },
    ],
    [
      "a tie counts as a matchup",
      () => {
        const tie = { albumAId: 1, albumBId: 2, result: "tie" };
        const progress = computeProgress(ratingsOf(2), [tie])!;
        expect(progress.played).toBe(1);
        expect(progress.confidence).toBeGreaterThan(0.5);
      },
    ],
    [
      "the same input twice gives equal output",
      () => {
        expect(progressOf(25, 2)).toEqual(progressOf(25, 2));
      },
    ],
  ])("%s", (_name, check) => check());
});

describe("formatPercent", () => {
  it.each([
    [99.9, "99"],
    [100, "100"],
    [90, "90"],
    [0, "0"],
  ])("%s reads %s", (value, text) => {
    expect(formatPercent(value)).toBe(text);
  });
});

describe("proof and timing", () => {
  it("prints the proof table and the 1,000-album timing", () => {
    const rows: Record<string, string | number>[] = [];
    for (const count of [10, 100, 1000]) {
      const rounds = 7; // 14 matchups per album, spread evenly
      const stages: [string, ReturnType<typeof computeProgress>][] = [
        ["no matchups", computeProgress(ratingsOf(count), [])],
        [`${rounds * 2} per album, even`, computeProgress(ratingsOf(count), evenMatchups(count, rounds))],
        ["then 10 albums added", computeProgress(ratingsOf(count + 10), evenMatchups(count, rounds))],
      ];
      for (const [stage, progress] of stages) {
        rows.push({
          albums: progress!.albumCount,
          stage,
          played: progress!.played,
          "confidence %": Number((progress!.confidence * 100).toFixed(1)),
          remaining: progress!.remaining,
          goal: progress!.goal,
          "percent": Number(progress!.percent.toFixed(1)),
        });
      }
    }
    console.table(rows);

    const ratings = ratingsOf(1000);
    const used = evenMatchups(1000, 7);
    const start = performance.now();
    const progress = computeProgress(ratings, used)!;
    console.log(`computeProgress for 1,000 albums and ${used.length} matchups: ${(performance.now() - start).toFixed(0)} ms`);
    expect(progress.albumCount).toBe(1000);
  });
});
