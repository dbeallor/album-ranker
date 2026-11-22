import { describe, expect, it } from "vitest";
import { computeRecords } from "./record";

describe("computeRecords", () => {
  it.each([
    {
      name: "no matchups",
      used: [],
      expected: [[1, { played: 0, wins: 0, losses: 0, ties: 0 }], [2, { played: 0, wins: 0, losses: 0, ties: 0 }]],
    },
    {
      name: "a win for the first album",
      used: [{ albumAId: 1, albumBId: 2, result: "a" as const }],
      expected: [[1, { played: 1, wins: 1, losses: 0, ties: 0 }], [2, { played: 1, wins: 0, losses: 1, ties: 0 }]],
    },
    {
      name: "a win for the second album",
      used: [{ albumAId: 1, albumBId: 2, result: "b" as const }],
      expected: [[1, { played: 1, wins: 0, losses: 1, ties: 0 }], [2, { played: 1, wins: 1, losses: 0, ties: 0 }]],
    },
    {
      name: "a tie counts for both",
      used: [{ albumAId: 1, albumBId: 2, result: "tie" as const }],
      expected: [[1, { played: 1, wins: 0, losses: 0, ties: 1 }], [2, { played: 1, wins: 0, losses: 0, ties: 1 }]],
    },
    {
      name: "several matchups add up",
      used: [
        { albumAId: 1, albumBId: 2, result: "a" as const },
        { albumAId: 2, albumBId: 1, result: "a" as const },
        { albumAId: 1, albumBId: 2, result: "tie" as const },
      ],
      expected: [[1, { played: 3, wins: 1, losses: 1, ties: 1 }], [2, { played: 3, wins: 1, losses: 1, ties: 1 }]],
    },
  ])("$name", ({ used, expected }) => {
    expect([...computeRecords([1, 2], used)]).toEqual(expected);
  });
});
