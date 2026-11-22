import { describe, expect, it } from "vitest";
import { createAlbum, findAlbumByCatalogId, listAlbums } from "../db/albums.ts";
import { listImportReviewItems } from "../db/import-review.ts";
import { addToLibrary, getLibraryEntry, listLibrary } from "../db/library.ts";
import { memoryDb } from "../db/test-db.ts";
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
  it("creates the album and artist from the catalog, and the library entry with the sheet's year and source", () => {
    const db = memoryDb();

    const result = writeRow(db, importRow({ key: key("Fake Album One", 2005) }), accept());

    expect(result.kind).toBe("imported");
    const album = findAlbumByCatalogId(db, "cat-one")!;
    expect(album).toMatchObject({
      title: "Fake Album One",
      releaseYear: 2001,
      coverUrl: "https://covers.test/cat-one",
      artist: { name: "Fake Artist A", catalogId: "art-a" },
    });
    // The sheet's year and text, not the catalog's.
    expect(getLibraryEntry(db, album.id)).toMatchObject({ year: 2005, source: key("Fake Album One", 2005) });
    expect(listImportReviewItems(db)).toEqual([]);
  });

  it.each([
    { name: "a ranked row", over: { placement: "ranked" as const, rank: 2, decadeRank: 4 } },
    { name: "an honorable mention", over: { placement: "honorable_mention" as const } },
    { name: "a listed row", over: {} },
  ])("adds $name to the library without using its rank, mention flag or decade rank", ({ over }) => {
    const db = memoryDb();
    const taken = createAlbum(db, { title: "Holder", artist: { name: "Someone" } });
    addToLibrary(db, { albumId: taken.id, year: 2001 });

    expect(writeRow(db, importRow({ key: key("Fake Album One"), ...over }), accept()).kind).toBe("imported");
    expect(listLibrary(db)).toHaveLength(2);
    expect(db.prepare("SELECT COUNT(*) AS n FROM import_review_items").get()!.n).toBe(0);
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

  it("reuses an album that exists but is not in the library", () => {
    const db = memoryDb();
    const existing = createAlbum(db, { title: "Fake Album One", artist: { name: "Fake Artist A", catalogId: "art-a" }, catalogId: "cat-one" });
    const result = writeRow(db, importRow({ key: key("Fake Album One") }), accept());
    expect(result).toMatchObject({ kind: "imported", albumId: existing.id });
    expect(listAlbums(db)).toHaveLength(1);
    expect(getLibraryEntry(db, existing.id)).toBeDefined();
  });
});

describe("writeRow review items", () => {
  it("sends a duplicate album match to review, naming its library year, and creates nothing", () => {
    const db = memoryDb();
    writeRow(db, importRow({ key: key("Fake Album One", 2001) }), accept());

    const result = writeRow(db, importRow({ key: key("Fake Album One", 2002), placement: "honorable_mention" }), accept());

    expect(result).toEqual({ kind: "review", reason: "duplicate_album" });
    expect(listLibrary(db)).toHaveLength(1);
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

  it("sends no match and ambiguous rows to review with their candidates", () => {
    const db = memoryDb();
    const typo = importRow({ key: key("Fake Alb One"), placement: "ranked", rank: 1 });
    const cases = [
      { row: typo, outcome: chooseMatch(typo, [ONE, TWO]), reason: "no_match", candidates: ["cat-one", "cat-two"] },
      {
        row: importRow({ key: key("Fake Album Two") }),
        outcome: chooseMatch(importRow({ key: key("Fake Album Two", 2030) }), [
          catalogAlbum("x", "Fake Album Two", "Fake Artist A", 1990),
          catalogAlbum("y", "Fake Album Two", "Fake Artist A", 2010),
        ]),
        reason: "ambiguous",
        candidates: ["y", "x"], // nearer the sheet's year first
      },
    ];
    for (const { row, outcome, reason, candidates } of cases) {
      expect(writeRow(db, row, outcome)).toEqual({ kind: "review", reason });
      const item = listImportReviewItems(db).find((i) => i.source.title === row.key.title)!;
      expect(item).toMatchObject({ reason, reasonDetail: null });
      expect(item.candidates.map((c) => c.catalogId)).toEqual(candidates);
    }
    expect(listAlbums(db)).toEqual([]);
    expect(listLibrary(db)).toEqual([]);
  });

  it("writes nothing when a step fails partway", () => {
    const db = memoryDb();
    const row = importRow({ key: key("Fake Album One", 1850) }); // a year outside 1900 to 2100 fails after the album insert
    expect(() => writeRow(db, row, accept())).toThrow();
    expect(listAlbums(db)).toEqual([]);
  });
});
