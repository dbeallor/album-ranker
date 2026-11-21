import { describe, expect, it } from "vitest";
import { findAlbumByCatalogId, listAlbums } from "../db/albums.ts";
import { MAX_DECADE_LIST, getDecadeList } from "../db/decade-lists.ts";
import { listImportReviewItems } from "../db/import-review.ts";
import { memoryDb } from "../db/test-db.ts";
import { getYearEntryByAlbum, listAllYearEntries } from "../db/year-entries.ts";
import { createAlbum } from "../db/albums.ts";
import { chooseMatch } from "./match.ts";
import { catalogAlbum, importRow } from "./test-support.ts";
import { writeRow } from "./write-row.ts";

const ONE = catalogAlbum("cat-one", "Fake Album One", "Fake Artist A", 2001, "art-a");
const TWO = catalogAlbum("cat-two", "Fake Album Two", "Fake Artist A", 2001, "art-a");
const key = (title: string, year = 2001) => ({ title, artist: "Fake Artist A", year });

function accept(album = ONE) {
  return { kind: "accepted" as const, album };
}

describe("writeRow accepted rows", () => {
  it("creates the album and artist from the catalog, and the year entry with the source key", () => {
    const db = memoryDb();
    const row = importRow({ key: key("Fake Album One"), placement: "ranked", rank: 2 });

    const result = writeRow(db, row, accept());

    expect(result).toMatchObject({ kind: "imported", decade: "none" });
    const album = findAlbumByCatalogId(db, "cat-one")!;
    expect(album).toMatchObject({
      title: "Fake Album One",
      releaseYear: 2001,
      coverUrl: "https://covers.test/cat-one",
      artist: { name: "Fake Artist A", catalogId: "art-a" },
    });
    expect(getYearEntryByAlbum(db, album.id)).toMatchObject({
      year: 2001,
      placement: "ranked",
      rank: 2,
      source: key("Fake Album One"),
      sourceDecadeRank: null,
    });
    expect(listImportReviewItems(db)).toEqual([]);
  });

  it("uses the sheet's year, not the catalog's", () => {
    const db = memoryDb();
    writeRow(db, importRow({ key: key("Fake Album One", 2005) }), accept());
    expect(getYearEntryByAlbum(db, findAlbumByCatalogId(db, "cat-one")!.id)!.year).toBe(2005);
  });

  it("shares one artist between albums with the same catalog artist id", () => {
    const db = memoryDb();
    writeRow(db, importRow({ key: key("Fake Album One") }), accept(ONE));
    writeRow(db, importRow({ key: key("Fake Album Two") }), accept(TWO));
    const [a, b] = listAlbums(db);
    expect(a.artist.id).toBe(b.artist.id);
  });

  it("keeps a collaboration's joined artist id as one artist", () => {
    const db = memoryDb();
    const collab = catalogAlbum("cat-c", "Fake Collab", "Fake Artist N & Fake Artist O", 2004, "art-n+art-o");
    writeRow(db, importRow({ key: { title: "Fake Collab", artist: "Fake Artist N & Fake Artist O", year: 2004 } }), accept(collab));
    expect(findAlbumByCatalogId(db, "cat-c")!.artist).toMatchObject({ name: "Fake Artist N & Fake Artist O", catalogId: "art-n+art-o" });
  });

  it("reuses an album that exists without a year entry", () => {
    const db = memoryDb();
    const existing = createAlbum(db, { title: "Fake Album One", artist: { name: "Fake Artist A", catalogId: "art-a" }, catalogId: "cat-one" });
    const result = writeRow(db, importRow({ key: key("Fake Album One") }), accept());
    expect(result).toMatchObject({ kind: "imported", albumId: existing.id });
    expect(listAlbums(db)).toHaveLength(1);
    expect(getYearEntryByAlbum(db, existing.id)).toBeDefined();
  });

  it("stores the source decade rank and puts a ranked or honorable mention album on its decade list", () => {
    const db = memoryDb();
    const result = writeRow(db, importRow({ key: key("Fake Album One"), placement: "honorable_mention", decadeRank: 4 }), accept());
    const album = findAlbumByCatalogId(db, "cat-one")!;
    expect(result).toMatchObject({ kind: "imported", decade: "inserted" });
    expect(getYearEntryByAlbum(db, album.id)!.sourceDecadeRank).toBe(4);
    expect(getDecadeList(db, 2000).map((e) => e.albumId)).toEqual([album.id]);
  });

  it("leaves an album off a full decade list but still imports it", () => {
    const db = memoryDb();
    for (let i = 1; i <= MAX_DECADE_LIST; i++) {
      writeRow(
        db,
        importRow({ key: key(`Filler ${i}`), placement: "honorable_mention", decadeRank: i }),
        accept(catalogAlbum(`f-${i}`, `Filler ${i}`, "Fake Artist A", 2001, "art-a")),
      );
    }
    const result = writeRow(db, importRow({ key: key("Fake Album One"), placement: "honorable_mention", decadeRank: 3 }), accept());
    expect(result).toMatchObject({ kind: "imported", decade: "full" });
    expect(getDecadeList(db, 2000)).toHaveLength(MAX_DECADE_LIST);
    expect(getYearEntryByAlbum(db, findAlbumByCatalogId(db, "cat-one")!.id)).toBeDefined();
  });
});

describe("writeRow review items", () => {
  it("sends a duplicate album match to review, naming the year, and creates nothing", () => {
    const db = memoryDb();
    writeRow(db, importRow({ key: key("Fake Album One", 2001) }), accept());

    const result = writeRow(db, importRow({ key: key("Fake Album One", 2002), placement: "honorable_mention" }), accept());

    expect(result).toEqual({ kind: "review", reason: "duplicate_album" });
    expect(listAllYearEntries(db)).toHaveLength(1);
    expect(listAlbums(db)).toHaveLength(1);
    const [item] = listImportReviewItems(db);
    expect(item).toMatchObject({
      source: key("Fake Album One", 2002),
      sourcePlacement: "honorable_mention",
      reason: "duplicate_album",
      reasonDetail: "2001",
      status: "open",
    });
    expect(item.candidates).toEqual([expect.objectContaining({ catalogId: "cat-one", artistId: "art-a" })]);
  });

  it("sends a taken rank to review, naming the album that holds it, and creates no album", () => {
    const db = memoryDb();
    writeRow(db, importRow({ key: key("Fake Album One"), placement: "ranked", rank: 2 }), accept(ONE));

    const result = writeRow(db, importRow({ key: key("Fake Album Two"), placement: "ranked", rank: 2, decadeRank: 1 }), accept(TWO));

    expect(result).toEqual({ kind: "review", reason: "rank_taken" });
    expect(findAlbumByCatalogId(db, "cat-two")).toBeUndefined();
    const [item] = listImportReviewItems(db);
    expect(item).toMatchObject({
      reason: "rank_taken",
      reasonDetail: "Fake Album One - Fake Artist A",
      sourceRank: 2,
      sourceDecadeRank: 1,
    });
    expect(item.candidates[0].catalogId).toBe("cat-two");
  });

  it("allows the same rank in another year", () => {
    const db = memoryDb();
    writeRow(db, importRow({ key: key("Fake Album One", 2001), placement: "ranked", rank: 2 }), accept(ONE));
    const result = writeRow(db, importRow({ key: key("Fake Album Two", 2002), placement: "ranked", rank: 2 }), accept(TWO));
    expect(result.kind).toBe("imported");
  });

  it("sends no match and ambiguous rows to review with their candidates", () => {
    const db = memoryDb();
    const typo = importRow({ key: key("Fake Albm One"), placement: "ranked", rank: 1 });
    const cases = [
      { row: typo, outcome: chooseMatch(typo, [ONE, TWO]), reason: "no_match", candidates: ["cat-one", "cat-two"] },
      {
        row: importRow({ key: key("Fake Album Two") }),
        outcome: chooseMatch(importRow({ key: key("Fake Album Two", 2030) }), [
          catalogAlbum("x", "Fake Album Two", "Fake Artist A", 1990),
          catalogAlbum("y", "Fake Album Two", "Fake Artist A", 2010),
        ]),
        reason: "ambiguous",
        candidates: ["x", "y"],
      },
    ];
    for (const { row, outcome, reason, candidates } of cases) {
      expect(writeRow(db, row, outcome)).toEqual({ kind: "review", reason });
      const item = listImportReviewItems(db).find((i) => i.source.title === row.key.title)!;
      expect(item).toMatchObject({ reason, reasonDetail: null });
      expect(item.candidates.map((c) => c.catalogId)).toEqual(candidates);
    }
    expect(listAlbums(db)).toEqual([]);
    expect(listAllYearEntries(db)).toEqual([]);
  });

  it("writes nothing when a step fails partway", () => {
    const db = memoryDb();
    const row = importRow({ key: key("Fake Album One"), placement: "ranked", rank: 11 }); // invalid rank fails after the album insert
    expect(() => writeRow(db, row, accept())).toThrow();
    expect(listAlbums(db)).toEqual([]);
  });
});
