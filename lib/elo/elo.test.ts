import { describe, expect, it } from "vitest";
import { applyResult, expectedScore, type EloResult } from "./elo";

describe("expectedScore", () => {
  it.each([
    { name: "equal ratings", a: 1500, b: 1500, expected: 0.5 },
    { name: "A 200 above B", a: 1700, b: 1500, expected: 0.7597469 },
    { name: "A 200 below B", a: 1500, b: 1700, expected: 0.2402531 },
  ])("$name", ({ a, b, expected }) => {
    expect(expectedScore(a, b)).toBeCloseTo(expected, 6);
  });
});

describe("applyResult", () => {
  it.each<{ name: string; a: number; b: number; result: EloResult; newA: number; newB: number }>([
    { name: "1500 v 1500, A wins", a: 1500, b: 1500, result: "a", newA: 1516, newB: 1484 },
    { name: "1500 v 1500, B wins", a: 1500, b: 1500, result: "b", newA: 1484, newB: 1516 },
    { name: "1500 v 1500, tie", a: 1500, b: 1500, result: "tie", newA: 1500, newB: 1500 },
    { name: "favourite 1600 v 1400 wins", a: 1600, b: 1400, result: "a", newA: 1607.6881, newB: 1392.3119 },
    { name: "favourite 1600 v 1400 loses", a: 1600, b: 1400, result: "b", newA: 1575.6881, newB: 1424.3119 },
    { name: "favourite 1600 v 1400 ties", a: 1600, b: 1400, result: "tie", newA: 1591.6881, newB: 1408.3119 },
  ])("$name", ({ a, b, result, newA, newB }) => {
    const next = applyResult(a, b, result);
    expect(next.a).toBeCloseTo(newA, 3);
    expect(next.b).toBeCloseTo(newB, 3);
  });
});
