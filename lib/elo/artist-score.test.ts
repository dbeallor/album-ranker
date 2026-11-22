import { describe, expect, it } from "vitest";
import { artistScore } from "./artist-score";

describe("artistScore", () => {
  it.each([
    { name: "1600 and 1700", ratings: [1600, 1700], expected: 1600 },
    { name: "one album", ratings: [1700], expected: 1600 },
    { name: "no rated albums", ratings: [], expected: undefined },
  ])("$name", ({ ratings, expected }) => {
    expect(artistScore(ratings)).toBe(expected);
  });
});
