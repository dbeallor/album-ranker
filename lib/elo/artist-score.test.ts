import { describe, expect, it } from "vitest";
import { artistScore } from "./artist-score";

const at = (excess: number) => 1500 + 100 * Math.log(1 + excess / 100);

describe("artistScore", () => {
  it.each([
    { name: "no albums", ratings: [], expected: undefined },
    { name: "one album at 1500", ratings: [1500], expected: 1500 },
    { name: "albums below 1500 add nothing", ratings: [1400, 1450], expected: 1500 },
    { name: "a low album does not cancel a high one", ratings: [1700, 1300], expected: at(200) },
    { name: "one album at 1700", ratings: [1700], expected: at(200) },
    { name: "three albums at 1700", ratings: [1700, 1700, 1700], expected: at(600) },
    { name: "six albums at 1700", ratings: Array(6).fill(1700), expected: at(1200) },
  ])("$name", ({ ratings, expected }) => {
    expect(artistScore(ratings)).toBe(expected);
  });

  it("scores six albums above three, with less than double the points above 1500", () => {
    const three = artistScore(Array(3).fill(1700))!;
    const six = artistScore(Array(6).fill(1700))!;
    expect(six).toBeGreaterThan(three);
    expect(six - 1500).toBeLessThan(2 * (three - 1500));
  });
});
