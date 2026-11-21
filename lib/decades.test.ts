import { describe, expect, it } from "vitest";
import { decadeSummaries, moveInList, suggestDecadeList } from "./decades";

const rated = (count: number) => Array.from({ length: count }, (_, i) => ({ albumId: i + 1, rating: 1500 - i }));

describe("suggestDecadeList", () => {
  it("sorts by rating, highest first", () => {
    const eligible = [
      { albumId: 1, rating: 1490 },
      { albumId: 2, rating: 1520 },
      { albumId: 3, rating: 1500 },
    ];
    expect(suggestDecadeList(eligible)).toEqual([2, 3, 1]);
  });

  it("gives ties to the lower album id", () => {
    const eligible = [
      { albumId: 9, rating: 1500 },
      { albumId: 4, rating: 1500 },
      { albumId: 7, rating: 1500 },
    ];
    expect(suggestDecadeList(eligible)).toEqual([4, 7, 9]);
  });

  it("stops at 25", () => {
    expect(suggestDecadeList(rated(40))).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
  });

  it("returns all of a set smaller than 25", () => {
    expect(suggestDecadeList(rated(3))).toEqual([1, 2, 3]);
  });

  it("returns nothing for no eligible albums", () => {
    expect(suggestDecadeList([])).toEqual([]);
  });
});

describe("moveInList", () => {
  const ids = [10, 20, 30, 40];

  it.each([
    { name: "drop down", move: { kind: "drop", from: 0, to: 2 }, expected: [20, 30, 10, 40] },
    { name: "drop up", move: { kind: "drop", from: 3, to: 1 }, expected: [10, 40, 20, 30] },
    { name: "move up", move: { kind: "up", id: 30 }, expected: [10, 30, 20, 40] },
    { name: "move down", move: { kind: "down", id: 20 }, expected: [10, 30, 20, 40] },
    { name: "move up at the top", move: { kind: "up", id: 10 }, expected: ids },
    { name: "move down at the bottom", move: { kind: "down", id: 40 }, expected: ids },
    { name: "add at the end", move: { kind: "add", id: 50 }, expected: [10, 20, 30, 40, 50] },
    { name: "add of an album already listed", move: { kind: "add", id: 20 }, expected: ids },
    { name: "remove from the middle", move: { kind: "remove", id: 20 }, expected: [10, 30, 40] },
  ] as const)("$name", ({ move, expected }) => {
    expect(moveInList(ids, move)).toEqual(expected);
  });

  it("does not add a 26th album", () => {
    const full = Array.from({ length: 25 }, (_, i) => i + 1);
    expect(moveInList(full, { kind: "add", id: 99 })).toEqual(full);
  });

  it("does not change the list it was given", () => {
    moveInList(ids, { kind: "up", id: 30 });
    expect(ids).toEqual([10, 20, 30, 40]);
  });
});

describe("decadeSummaries", () => {
  it("counts only ranked and honorable mention entries as eligible, and shows a decade with only listed albums", () => {
    const entries = [
      { year: 1994, placement: "ranked" as const },
      { year: 1999, placement: "honorable_mention" as const },
      { year: 1995, placement: "listed" as const },
      { year: 1985, placement: "listed" as const },
    ];
    expect(decadeSummaries(entries, [])).toEqual([
      { decade: 1980, listCount: 0, eligibleCount: 0 },
      { decade: 1990, listCount: 0, eligibleCount: 2 },
    ]);
  });

  it("counts a decade's list entries, oldest decade first", () => {
    const entries = [
      { year: 2003, placement: "ranked" as const },
      { year: 1991, placement: "ranked" as const },
    ];
    const lists = [{ decade: 1990 }, { decade: 1990 }, { decade: 2000 }];
    expect(decadeSummaries(entries, lists)).toEqual([
      { decade: 1990, listCount: 2, eligibleCount: 1 },
      { decade: 2000, listCount: 1, eligibleCount: 1 },
    ]);
  });
});
