import { describe, expect, it } from "vitest";
import { computeRecords } from "./record";

const DAY1 = "2025-01-01T00:00:00.000Z";
const DAY2 = "2025-01-02T00:00:00.000Z";
const DAY3 = "2025-01-03T00:00:00.000Z";

describe("computeRecords", () => {
  it.each([
    {
      name: "no matchups",
      used: [],
      expected: [[1, { played: 0, wins: 0, losses: 0, ties: 0, lastAt: null }], [2, { played: 0, wins: 0, losses: 0, ties: 0, lastAt: null }]],
    },
    {
      name: "a win for the first album",
      used: [{ albumAId: 1, albumBId: 2, result: "a" as const, createdAt: DAY1 }],
      expected: [[1, { played: 1, wins: 1, losses: 0, ties: 0, lastAt: DAY1 }], [2, { played: 1, wins: 0, losses: 1, ties: 0, lastAt: DAY1 }]],
    },
    {
      name: "a win for the second album",
      used: [{ albumAId: 1, albumBId: 2, result: "b" as const, createdAt: DAY1 }],
      expected: [[1, { played: 1, wins: 0, losses: 1, ties: 0, lastAt: DAY1 }], [2, { played: 1, wins: 1, losses: 0, ties: 0, lastAt: DAY1 }]],
    },
    {
      name: "a tie counts for both",
      used: [{ albumAId: 1, albumBId: 2, result: "tie" as const, createdAt: DAY1 }],
      expected: [[1, { played: 1, wins: 0, losses: 0, ties: 1, lastAt: DAY1 }], [2, { played: 1, wins: 0, losses: 0, ties: 1, lastAt: DAY1 }]],
    },
    {
      name: "several matchups add up, and the latest one is the last matchup",
      used: [
        { albumAId: 1, albumBId: 2, result: "a" as const, createdAt: DAY2 },
        { albumAId: 2, albumBId: 1, result: "a" as const, createdAt: DAY3 },
        { albumAId: 1, albumBId: 2, result: "tie" as const, createdAt: DAY1 },
      ],
      expected: [[1, { played: 3, wins: 1, losses: 1, ties: 1, lastAt: DAY3 }], [2, { played: 3, wins: 1, losses: 1, ties: 1, lastAt: DAY3 }]],
    },
  ])("$name", ({ used, expected }) => {
    expect([...computeRecords([1, 2], used)]).toEqual(expected);
  });
});
