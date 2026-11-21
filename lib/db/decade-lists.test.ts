import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { getDecadeList, insertIntoDecadeBySourceRank, setDecadeList } from "./decade-lists";
import { errorCode, memoryDb, seedAlbums } from "./test-db";
import type { Placement } from "./types";
import { addYearEntry, moveYearEntry, updateYearEntry } from "./year-entries";

function enter(
  db: DatabaseSync,
  albumId: number,
  year: number,
  placement: Placement,
  rank?: number,
  sourceDecadeRank?: number,
) {
  addYearEntry(db, { albumId, year, placement, rank, sourceDecadeRank });
}

describe("decade lists", () => {
  const cases: { name: string; setup: (db: DatabaseSync, id: number) => void; code: string | null }[] = [
    { name: "a ranked album in the decade is accepted", setup: (db, id) => enter(db, id, 1994, "ranked", 1), code: null },
    { name: "an honorable mention in the decade is accepted", setup: (db, id) => enter(db, id, 1991, "honorable_mention"), code: null },
    { name: "a listed album is rejected", setup: (db, id) => enter(db, id, 1994, "listed"), code: "not_eligible_for_decade" },
    { name: "an album from another decade is rejected", setup: (db, id) => enter(db, id, 2001, "ranked", 1), code: "not_eligible_for_decade" },
    { name: "an album with no year entry is rejected", setup: () => {}, code: "not_eligible_for_decade" },
  ];
  it.each(cases)("$name", ({ setup, code }) => {
    const db = memoryDb();
    const [id] = seedAlbums(db, 1);
    setup(db, id);
    if (code === null) {
      expect(setDecadeList(db, 1990, [id])).toMatchObject([{ decade: 1990, albumId: id, position: 1 }]);
    } else {
      expect(errorCode(() => setDecadeList(db, 1990, [id]))).toBe(code);
      expect(getDecadeList(db, 1990)).toEqual([]);
    }
  });

  it("rejects more than 25 albums and repeated albums", () => {
    const db = memoryDb();
    const ids = seedAlbums(db, 26);
    expect(errorCode(() => setDecadeList(db, 1990, ids))).toBe("invalid_input");
    ids.slice(0, 2).forEach((id, i) => enter(db, id, 1990 + i, "listed"));
    expect(errorCode(() => setDecadeList(db, 1990, [ids[0], ids[0]]))).toBe("invalid_input");
  });

  it("moving an album out of the decade removes its entry, closes the gap and reports it", () => {
    const db = memoryDb();
    const [a, b, c] = seedAlbums(db, 3);
    enter(db, a, 1990, "ranked", 1);
    enter(db, b, 1991, "ranked", 1);
    enter(db, c, 1992, "honorable_mention");
    setDecadeList(db, 1990, [a, b, c]);

    const { removedDecadeEntries } = moveYearEntry(db, b, 2005);

    expect(removedDecadeEntries).toMatchObject([{ decade: 1990, albumId: b, position: 2 }]);
    expect(getDecadeList(db, 1990).map((e) => [e.albumId, e.position])).toEqual([
      [a, 1],
      [c, 2],
    ]);
  });

  it("becoming listed removes the decade entry too", () => {
    const db = memoryDb();
    const [a] = seedAlbums(db, 1);
    enter(db, a, 1990, "ranked", 1);
    setDecadeList(db, 1990, [a]);
    const { removedDecadeEntries } = updateYearEntry(db, a, { placement: "listed" });
    expect(removedDecadeEntries).toHaveLength(1);
    expect(getDecadeList(db, 1990)).toEqual([]);
  });
});

describe("insertIntoDecadeBySourceRank", () => {
  /** Seeds albums on 1990 honorable mentions with these source decade ranks (null = added by hand). */
  function seed(db: DatabaseSync, ranks: (number | null)[]): number[] {
    const ids = seedAlbums(db, ranks.length);
    ids.forEach((id, i) => enter(db, id, 1990, "honorable_mention", undefined, ranks[i] ?? undefined));
    return ids;
  }
  const order = (db: DatabaseSync) => getDecadeList(db, 1990).map((e) => e.albumId);

  const cases: { name: string; ranks: (number | null)[]; insertOrder: number[]; expected: number[] }[] = [
    { name: "rows resolved out of order end in sheet order", ranks: [3, 1, 2], insertOrder: [0, 1, 2], expected: [1, 2, 0] },
    { name: "rows already in order stay in order", ranks: [1, 2, 3], insertOrder: [0, 1, 2], expected: [0, 1, 2] },
    { name: "a rank higher than all goes to the end", ranks: [1, 9], insertOrder: [1, 0], expected: [0, 1] },
    { name: "an equal rank goes after the existing entry", ranks: [2, 2], insertOrder: [0, 1], expected: [0, 1] },
  ];
  it.each(cases)("$name", ({ ranks, insertOrder, expected }) => {
    const db = memoryDb();
    const ids = seed(db, ranks);
    for (const i of insertOrder) insertIntoDecadeBySourceRank(db, ids[i], 1990);
    expect(order(db)).toEqual(expected.map((i) => ids[i]));
    expect(getDecadeList(db, 1990).map((e) => e.position)).toEqual(expected.map((_, i) => i + 1));
  });

  it("keeps hand-added entries (no source rank) in place and skips past them", () => {
    const db = memoryDb();
    const [manual, a, b] = seed(db, [null, 5, 2]);
    setDecadeList(db, 1990, [manual]);
    expect(insertIntoDecadeBySourceRank(db, a, 1990)).toEqual({ status: "inserted", position: 2 });
    expect(insertIntoDecadeBySourceRank(db, b, 1990)).toEqual({ status: "inserted", position: 2 });
    expect(order(db)).toEqual([manual, b, a]);
  });

  it("puts an album with no source rank at the end", () => {
    const db = memoryDb();
    const [a, b] = seed(db, [4, null]);
    insertIntoDecadeBySourceRank(db, a, 1990);
    insertIntoDecadeBySourceRank(db, b, 1990);
    expect(order(db)).toEqual([a, b]);
  });

  it("leaves a full list unchanged and says so", () => {
    const db = memoryDb();
    const ids = seed(db, Array.from({ length: 26 }, (_, i) => Math.min(i + 1, 25)));
    setDecadeList(db, 1990, ids.slice(0, 25));
    const before = getDecadeList(db, 1990);
    expect(insertIntoDecadeBySourceRank(db, ids[25], 1990)).toEqual({ status: "full" });
    expect(getDecadeList(db, 1990)).toEqual(before);
  });

  it("does not add an album that is already on the list again", () => {
    const db = memoryDb();
    const [a] = seed(db, [1]);
    insertIntoDecadeBySourceRank(db, a, 1990);
    expect(insertIntoDecadeBySourceRank(db, a, 1990)).toEqual({ status: "already_listed", position: 1 });
    expect(order(db)).toEqual([a]);
  });

  const ineligible: { name: string; setup: (db: DatabaseSync, id: number) => void }[] = [
    { name: "a listed album", setup: (db, id) => enter(db, id, 1994, "listed") },
    { name: "an album from another decade", setup: (db, id) => enter(db, id, 2001, "ranked", 1) },
    { name: "an album with no year entry", setup: () => {} },
  ];
  it.each(ineligible)("rejects $name and changes nothing", ({ setup }) => {
    const db = memoryDb();
    const [id] = seedAlbums(db, 1);
    setup(db, id);
    expect(errorCode(() => insertIntoDecadeBySourceRank(db, id, 1990))).toBe("not_eligible_for_decade");
    expect(getDecadeList(db, 1990)).toEqual([]);
  });
});
