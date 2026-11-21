import { describe, expect, it } from "vitest";
import { applyMove, dropTarget, moveDown, moveUp, removeAlbum, type Placements } from "./year-placements";

const base: Placements = { ranked: [1, 2, 3, 4], honorableMentions: [5, 6], listed: [7] };
const ids = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe("applyMove", () => {
  it("rank 4 dropped on rank 1 becomes rank 1 and shifts the others down", () => {
    const { placements, pushedOut } = applyMove(base, 4, { area: "ranked", index: 0 });
    expect(placements.ranked).toEqual([4, 1, 2, 3]);
    expect(pushedOut).toBeNull();
  });

  it("rank 1 dropped on rank 3 takes that slot and shifts the others up", () => {
    expect(applyMove(base, 1, { area: "ranked", index: 2 }).placements.ranked).toEqual([2, 3, 1, 4]);
  });

  it.each([
    { name: "ranked to honorable mention", id: 2, area: "honorable_mention" as const, expected: { ranked: [1, 3, 4], honorableMentions: [5, 6, 2], listed: [7] } },
    { name: "ranked to listed", id: 1, area: "listed" as const, expected: { ranked: [2, 3, 4], honorableMentions: [5, 6], listed: [7, 1] } },
    { name: "honorable mention to listed", id: 5, area: "listed" as const, expected: { ranked: [1, 2, 3, 4], honorableMentions: [6], listed: [7, 5] } },
    { name: "listed to honorable mention", id: 7, area: "honorable_mention" as const, expected: { ranked: [1, 2, 3, 4], honorableMentions: [5, 6, 7], listed: [] } },
  ])("$name", ({ id, area, expected }) => {
    expect(applyMove(base, id, { area }).placements).toEqual(expected);
  });

  it("inserts an album from another area at the dropped slot", () => {
    expect(applyMove(base, 7, { area: "ranked", index: 1 }).placements).toEqual({
      ranked: [1, 7, 2, 3, 4],
      honorableMentions: [5, 6],
      listed: [],
    });
  });

  it("pushes rank 10 to honorable mentions when an eleventh album is dropped in", () => {
    const full: Placements = { ranked: ids(1, 10), honorableMentions: [], listed: [11] };
    const { placements, pushedOut } = applyMove(full, 11, { area: "ranked", index: 0 });
    expect(placements.ranked).toEqual([11, ...ids(1, 9)]);
    expect(placements.honorableMentions).toEqual([10]);
    expect(pushedOut).toBe(10);
  });

  it("an eleventh album added at the end takes rank 10 and pushes the old rank 10 out", () => {
    const full: Placements = { ranked: ids(1, 10), honorableMentions: [], listed: [11] };
    const { placements, pushedOut } = applyMove(full, 11, { area: "ranked" });
    expect(placements.ranked).toEqual([...ids(1, 9), 11]);
    expect(pushedOut).toBe(10);
  });

  it("reordering inside a full ranked list pushes nothing out", () => {
    const full: Placements = { ranked: ids(1, 10), honorableMentions: [], listed: [] };
    const { placements, pushedOut } = applyMove(full, 10, { area: "ranked", index: 0 });
    expect(placements.ranked).toEqual([10, ...ids(1, 9)]);
    expect(pushedOut).toBeNull();
  });
});

describe("moveUp, moveDown and removeAlbum", () => {
  it("moves one step and stops at the ends", () => {
    expect(moveUp(base, 3).ranked).toEqual([1, 3, 2, 4]);
    expect(moveDown(base, 2).ranked).toEqual([1, 3, 2, 4]);
    expect(moveUp(base, 1)).toBe(base);
    expect(moveDown(base, 4)).toBe(base);
  });

  it("removes an album from whichever area holds it", () => {
    expect(removeAlbum(base, 2).ranked).toEqual([1, 3, 4]);
    expect(removeAlbum(base, 6).honorableMentions).toEqual([5]);
    expect(removeAlbum(base, 7).listed).toEqual([]);
  });
});

describe("dropTarget", () => {
  // Ranked 1 to 4 (ids 1-4), honorable mentions 5 and 6, listed 7 and 8.
  const placements: Placements = { ranked: [1, 2, 3, 4], honorableMentions: [5, 6], listed: [7, 8] };
  const gap = [1, 2, 4, 5]; // stored ranks with rank 3 missing, for ids 1-4

  it.each([
    { name: "a ranked card on another ranked card takes its position", id: 4, over: "album-2", layout: null, expected: { area: "ranked", index: 1 } },
    { name: "a ranked card on itself is a no-op", id: 2, over: "album-2", layout: null, expected: null },
    { name: "a listed card on a ranked card goes into ranked at that position", id: 7, over: "album-3", layout: null, expected: { area: "ranked", index: 2 } },
    { name: "a ranked card on a card in another area moves to that area", id: 1, over: "album-6", layout: null, expected: { area: "honorable_mention" } },
    { name: "an honorable mention on a card in its own area is a no-op", id: 5, over: "album-6", layout: null, expected: null },
    { name: "a listed card on a card in its own area is a no-op", id: 7, over: "album-8", layout: null, expected: null },
    { name: "a filled slot gives the position of its card", id: 7, over: "slot-2", layout: null, expected: { area: "ranked", index: 1 } },
    { name: "an empty slot appends to the end", id: 7, over: "slot-9", layout: null, expected: { area: "ranked", index: undefined } },
    { name: "a slot after a rank gap gives the card's position, not the slot number", id: 7, over: "slot-4", layout: gap, expected: { area: "ranked", index: 2 } },
    { name: "the empty slot in a rank gap appends to the end", id: 7, over: "slot-3", layout: gap, expected: { area: "ranked", index: undefined } },
    { name: "an area zone gives that area", id: 1, over: "area-listed", layout: null, expected: { area: "listed" } },
    { name: "an area zone it is already in is a no-op", id: 5, over: "area-honorable_mention", layout: null, expected: null },
  ])("$name", ({ id, over, layout, expected }) => {
    expect(dropTarget(placements, layout, id, over)).toEqual(expected);
  });
});
