import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { getDecadeList, setDecadeList } from "./decade-lists";
import { errorCode, memoryDb, seedAlbums } from "./test-db";
import type { Placement } from "./types";
import { addYearEntry, moveYearEntry, updateYearEntry } from "./year-entries";

function enter(db: DatabaseSync, albumId: number, year: number, placement: Placement, rank?: number) {
  addYearEntry(db, { albumId, year, placement, rank });
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
