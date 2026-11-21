import { describe, expect, it } from "vitest";
import {
  addYearEntry,
  getYearEntryByAlbum,
  listAllYearEntries,
  listYear,
  removeYearEntry,
  setYearPlacements,
  updateYearEntry,
} from "./year-entries";
import { errorCode, memoryDb, seedAlbums } from "./test-db";
import type { Placement } from "./types";

describe("year entries", () => {
  it("creates, reads, updates and deletes an entry", () => {
    const db = memoryDb();
    const [a] = seedAlbums(db, 1);

    const added = addYearEntry(db, { albumId: a, year: 1999, placement: "ranked", rank: 3 });
    expect(added).toMatchObject({ albumId: a, year: 1999, placement: "ranked", rank: 3, source: null });
    expect(getYearEntryByAlbum(db, a)).toEqual(added);
    expect(listYear(db, 1999)).toEqual([added]);

    const { entry } = updateYearEntry(db, a, { placement: "ranked", rank: 1 });
    expect(entry.rank).toBe(1);
    expect(listAllYearEntries(db)).toEqual([entry]);

    removeYearEntry(db, a);
    expect(getYearEntryByAlbum(db, a)).toBeUndefined();
    expect(listAllYearEntries(db)).toEqual([]);
  });

  const placements: { placement: Placement; rank: number | null }[] = [
    { placement: "ranked", rank: 2 },
    { placement: "honorable_mention", rank: null },
    { placement: "listed", rank: null },
  ];
  it.each(placements)("stores and reads back $placement", ({ placement, rank }) => {
    const db = memoryDb();
    const [a] = seedAlbums(db, 1);
    addYearEntry(db, { albumId: a, year: 2004, placement, rank });
    expect(getYearEntryByAlbum(db, a)).toMatchObject({ year: 2004, placement, rank });
  });

  const rejections: {
    name: string;
    second: { year: number; placement: Placement; rank?: number | null; sameAlbum?: boolean };
    code: string;
  }[] = [
    {
      name: "a second entry for one album",
      second: { year: 2001, placement: "listed", sameAlbum: true },
      code: "album_has_year_entry",
    },
    { name: "a duplicate rank in a year", second: { year: 1999, placement: "ranked", rank: 1 }, code: "rank_taken" },
    { name: "a rank on a honorable mention", second: { year: 1999, placement: "honorable_mention", rank: 4 }, code: "invalid_rank" },
    { name: "a ranked entry with no rank", second: { year: 1999, placement: "ranked" }, code: "invalid_rank" },
    { name: "a rank above 10", second: { year: 1999, placement: "ranked", rank: 11 }, code: "invalid_rank" },
  ];
  it.each(rejections)("rejects $name", ({ second, code }) => {
    const db = memoryDb();
    const [a, b] = seedAlbums(db, 2);
    addYearEntry(db, { albumId: a, year: 1999, placement: "ranked", rank: 1 });
    const albumId = second.sameAlbum ? a : b;
    expect(errorCode(() => addYearEntry(db, { albumId, ...second }))).toBe(code);
    expect(listAllYearEntries(db)).toHaveLength(1);
  });

  it("swaps two ranks with setYearPlacements and keeps gaps", () => {
    const db = memoryDb();
    const [a, b, c] = seedAlbums(db, 3);
    addYearEntry(db, { albumId: a, year: 2010, placement: "ranked", rank: 1 });
    addYearEntry(db, { albumId: b, year: 2010, placement: "ranked", rank: 2 });
    addYearEntry(db, { albumId: c, year: 2010, placement: "ranked", rank: 5 });

    const { entries } = setYearPlacements(db, 2010, {
      ranked: [
        { albumId: a, rank: 2 },
        { albumId: b, rank: 1 },
        { albumId: c, rank: 5 },
      ],
      honorableMentions: [],
      listed: [],
    });

    expect(entries.map((e) => [e.albumId, e.rank])).toEqual([
      [b, 1],
      [a, 2],
      [c, 5],
    ]);
  });

  it("enforces a unique source row key", () => {
    const db = memoryDb();
    const [a, b] = seedAlbums(db, 2);
    const source = { title: "Kid A", artist: "Radiohead", year: 2000 };
    addYearEntry(db, { albumId: a, year: 2000, placement: "listed", source });
    expect(getYearEntryByAlbum(db, a)!.source).toEqual(source);
    expect(errorCode(() => addYearEntry(db, { albumId: b, year: 2000, placement: "listed", source }))).toBe(
      "invalid_input",
    );
  });
});
