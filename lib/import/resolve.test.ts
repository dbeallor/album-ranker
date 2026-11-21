import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createAlbum, findAlbumByCatalogId, listAlbums } from "../db/albums.ts";
import { getDecadeList, setDecadeList } from "../db/decade-lists.ts";
import {
  createImportReviewItem,
  getImportReviewItem,
  listImportReviewItems,
  type CreateImportReviewItemInput,
} from "../db/import-review.ts";
import { memoryDb } from "../db/test-db.ts";
import type { CatalogCandidate } from "../db/types.ts";
import { addYearEntry, getYearEntryByAlbum, listAllYearEntries, removeYearEntry } from "../db/year-entries.ts";
import { resolveReviewItem, skipReviewItem } from "./resolve.ts";

const CANDIDATE: CatalogCandidate = {
  catalogId: "cat-one",
  title: "Fake Album One",
  artist: "Fake Artist A",
  artistId: "art-a",
  releaseYear: 2001,
  coverUrl: "https://covers.test/cat-one",
};

function item(db: DatabaseSync, over: Partial<CreateImportReviewItemInput> = {}) {
  return createImportReviewItem(db, {
    source: { title: "Fake Albm One", artist: "Fake Artist A", year: 2001 },
    sourcePlacement: "ranked",
    sourceRank: 3,
    sourceDecadeRank: 2,
    candidates: [CANDIDATE],
    ...over,
  });
}

function manualOnYear(db: DatabaseSync, title: string, year: number, placement: "ranked" | "listed", rank?: number) {
  const album = createAlbum(db, { title, artist: { name: `Artist of ${title}` } });
  addYearEntry(db, { albumId: album.id, year, placement, rank });
  return album;
}

describe("using a catalog album", () => {
  it("creates the album and artist, the year entry with the source row, the decade entry, and resolves the item", () => {
    const db = memoryDb();
    const review = item(db);

    const result = resolveReviewItem(db, review.id, { kind: "catalog", album: CANDIDATE });

    expect(result).toMatchObject({ ok: true, movedFromYear: null, decade: { status: "inserted", position: 1 } });
    if (!result.ok) return;
    const album = findAlbumByCatalogId(db, "cat-one")!;
    expect(album).toMatchObject({
      id: result.albumId,
      title: "Fake Album One",
      releaseYear: 2001,
      coverUrl: "https://covers.test/cat-one",
      artist: { name: "Fake Artist A", catalogId: "art-a" },
    });
    expect(getYearEntryByAlbum(db, album.id)).toMatchObject({
      year: 2001,
      placement: "ranked",
      rank: 3,
      source: review.source, // the sheet's text, not the catalog's
      sourceDecadeRank: 2,
    });
    expect(getDecadeList(db, 2000).map((e) => e.albumId)).toEqual([album.id]);
    expect(getImportReviewItem(db, review.id)).toMatchObject({ status: "resolved", resolvedAlbumId: album.id });
  });

  it("shares the artist with an album already in the catalog from the same artist", () => {
    const db = memoryDb();
    createAlbum(db, { title: "Other", artist: { name: "Fake Artist A", catalogId: "art-a" }, catalogId: "cat-other" });
    resolveReviewItem(db, item(db).id, { kind: "catalog", album: CANDIDATE });
    expect(new Set(listAlbums(db).map((a) => a.artist.id)).size).toBe(1);
  });

  it("reuses an album that has no year entry", () => {
    const db = memoryDb();
    const existing = createAlbum(db, { title: "Fake Album One", artist: { name: "Fake Artist A", catalogId: "art-a" }, catalogId: "cat-one" });
    const result = resolveReviewItem(db, item(db).id, { kind: "catalog", album: CANDIDATE });
    expect(result).toMatchObject({ ok: true, albumId: existing.id });
    expect(listAlbums(db)).toHaveLength(1);
  });

  const placements = [
    { name: "an honorable mention", over: { sourcePlacement: "honorable_mention" as const, sourceRank: null }, decade: "inserted" },
    { name: "a listed row, which has no decade rank", over: { sourcePlacement: "listed" as const, sourceRank: null, sourceDecadeRank: null }, decade: null },
    { name: "a ranked row without a decade rank", over: { sourceDecadeRank: null }, decade: null },
  ];
  it.each(placements)("imports $name", ({ over, decade }) => {
    const db = memoryDb();
    const result = resolveReviewItem(db, item(db, over).id, { kind: "catalog", album: CANDIDATE });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.decade?.status ?? null).toBe(decade);
    expect(getYearEntryByAlbum(db, findAlbumByCatalogId(db, "cat-one")!.id)).toMatchObject({
      placement: over.sourcePlacement ?? "ranked",
    });
  });

  it("puts the album on the decade list by the sheet's decade rank when items resolve out of order", () => {
    const db = memoryDb();
    const rows = [3, 1, 2].map((decadeRank) => {
      const title = `Fake Album ${decadeRank}`;
      const candidate = { ...CANDIDATE, catalogId: `cat-${decadeRank}`, title };
      return {
        candidate,
        review: item(db, {
          source: { title, artist: "Fake Artist A", year: 2001 + decadeRank },
          sourcePlacement: "honorable_mention",
          sourceRank: null,
          sourceDecadeRank: decadeRank,
          candidates: [candidate],
        }),
      };
    });
    for (const { review, candidate } of rows) resolveReviewItem(db, review.id, { kind: "catalog", album: candidate });

    const titles = new Map(listAlbums(db).map((a) => [a.id, a.title]));
    expect(getDecadeList(db, 2000).map((e) => titles.get(e.albumId))).toEqual(["Fake Album 1", "Fake Album 2", "Fake Album 3"]);
  });
});

describe("keeping a manual album", () => {
  it("creates a manual album from the row with the same year and decade entries", () => {
    const db = memoryDb();
    const review = item(db);

    const result = resolveReviewItem(db, review.id, { kind: "manual" });

    expect(result).toMatchObject({ ok: true, decade: { status: "inserted" } });
    const [album] = listAlbums(db);
    expect(album).toMatchObject({
      title: "Fake Albm One", // as written in the sheet
      artist: { name: "Fake Artist A", catalogId: null },
      catalogId: null,
      releaseYear: 2001,
      coverUrl: null,
    });
    expect(getYearEntryByAlbum(db, album.id)).toMatchObject({ year: 2001, placement: "ranked", rank: 3, source: review.source, sourceDecadeRank: 2 });
    expect(getImportReviewItem(db, review.id)).toMatchObject({ status: "resolved", resolvedAlbumId: album.id });
  });

  it("reuses the manual artist of the same name", () => {
    const db = memoryDb();
    resolveReviewItem(db, item(db).id, { kind: "manual" });
    resolveReviewItem(
      db,
      item(db, { source: { title: "Fake Album Two", artist: "Fake Artist A", year: 2002 }, sourceRank: 1 }).id,
      { kind: "manual" },
    );
    expect(new Set(listAlbums(db).map((a) => a.artist.id)).size).toBe(1);
  });
});

describe("skipping", () => {
  it("marks the item skipped and adds nothing", () => {
    const db = memoryDb();
    const review = item(db);
    const result = skipReviewItem(db, review.id);
    expect(result).toMatchObject({ ok: true, item: { status: "skipped", resolvedAlbumId: null } });
    expect(listAlbums(db)).toEqual([]);
    expect(listAllYearEntries(db)).toEqual([]);
  });
});

describe("items that can't be resolved", () => {
  it("fails for an item that is not open or does not exist, changing nothing", () => {
    const db = memoryDb();
    const review = item(db);
    skipReviewItem(db, review.id);
    expect(resolveReviewItem(db, review.id, { kind: "manual" })).toMatchObject({ ok: false, code: "not_open" });
    expect(skipReviewItem(db, review.id)).toMatchObject({ ok: false, code: "not_open" });
    expect(resolveReviewItem(db, 999, { kind: "manual" })).toMatchObject({ ok: false, code: "not_found" });
    expect(skipReviewItem(db, 999)).toMatchObject({ ok: false, code: "not_found" });
    expect(listAlbums(db)).toEqual([]);
  });

  it("resolving twice does not add a second album", () => {
    const db = memoryDb();
    const review = item(db);
    resolveReviewItem(db, review.id, { kind: "manual" });
    expect(resolveReviewItem(db, review.id, { kind: "manual" })).toMatchObject({ ok: false, code: "not_open" });
    expect(listAlbums(db)).toHaveLength(1);
  });
});

describe("a taken rank", () => {
  const choices = [
    { name: "using a catalog album", choice: { kind: "catalog" as const, album: CANDIDATE } },
    { name: "keeping a manual album", choice: { kind: "manual" as const } },
  ];
  it.each(choices)("fails naming the album that holds it when $name, and the item stays open", ({ choice }) => {
    const db = memoryDb();
    const holder = manualOnYear(db, "Fake Album Holder", 2001, "ranked", 3);
    const review = item(db);

    const result = resolveReviewItem(db, review.id, choice);

    expect(result).toEqual({
      ok: false,
      code: "rank_taken",
      message: "Rank 3 in 2001 is held by Fake Album Holder - Artist of Fake Album Holder.",
      holder: { albumId: holder.id, title: "Fake Album Holder", artist: "Artist of Fake Album Holder" },
    });
    expect(getImportReviewItem(db, review.id)!.status).toBe("open");
    expect(listAlbums(db)).toHaveLength(1);
    expect(listAllYearEntries(db)).toHaveLength(1);
  });

  it("works once the user frees the rank", () => {
    const db = memoryDb();
    const holder = manualOnYear(db, "Fake Album Holder", 2001, "ranked", 3);
    const review = item(db);
    expect(resolveReviewItem(db, review.id, { kind: "manual" }).ok).toBe(false);
    removeYearEntry(db, holder.id);
    expect(resolveReviewItem(db, review.id, { kind: "manual" }).ok).toBe(true);
  });
});

describe("an album already on a year page", () => {
  function setup(db: DatabaseSync) {
    const album = createAlbum(db, { title: "Fake Album One", artist: { name: "Fake Artist A", catalogId: "art-a" }, catalogId: "cat-one" });
    addYearEntry(db, { albumId: album.id, year: 2004, placement: "ranked", rank: 1, sourceDecadeRank: 9 });
    setDecadeList(db, 2000, [album.id]);
    return album;
  }

  it("says which year it is on and does not move it by default", () => {
    const db = memoryDb();
    const album = setup(db);
    const review = item(db);

    const result = resolveReviewItem(db, review.id, { kind: "catalog", album: CANDIDATE });

    expect(result).toEqual({
      ok: false,
      code: "album_on_year_page",
      message: "Fake Album One is already on the 2004 year page.",
      albumId: album.id,
      year: 2004,
    });
    expect(getYearEntryByAlbum(db, album.id)).toMatchObject({ year: 2004 });
    expect(getImportReviewItem(db, review.id)!.status).toBe("open");
  });

  it("moves its year entry to the row's year and placement when told to", () => {
    const db = memoryDb();
    const album = setup(db);
    const review = item(db, { sourcePlacement: "honorable_mention", sourceRank: null, sourceDecadeRank: 4 });

    const result = resolveReviewItem(db, review.id, { kind: "catalog", album: CANDIDATE, moveHere: true });

    expect(result).toMatchObject({ ok: true, albumId: album.id, movedFromYear: 2004, decade: { status: "already_listed" } });
    expect(getYearEntryByAlbum(db, album.id)).toMatchObject({ year: 2001, placement: "honorable_mention", rank: null, sourceDecadeRank: 4 });
    expect(listAlbums(db)).toHaveLength(1);
    expect(getImportReviewItem(db, review.id)).toMatchObject({ status: "resolved", resolvedAlbumId: album.id });
  });

  it("drops it from the decade list when the move makes it ineligible, and says so", () => {
    const db = memoryDb();
    const album = setup(db);
    const review = item(db, { sourcePlacement: "listed", sourceRank: null, sourceDecadeRank: null });

    const result = resolveReviewItem(db, review.id, { kind: "catalog", album: CANDIDATE, moveHere: true });

    expect(result.ok && result.removedDecadeEntries.map((e) => e.albumId)).toEqual([album.id]);
    expect(getDecadeList(db, 2000)).toEqual([]);
  });

  it("fails when the rank is taken in the row's year, leaving the album and the item as they were", () => {
    const db = memoryDb();
    const album = setup(db);
    manualOnYear(db, "Fake Album Holder", 2001, "ranked", 3);
    const review = item(db);

    const result = resolveReviewItem(db, review.id, { kind: "catalog", album: CANDIDATE, moveHere: true });

    expect(result).toMatchObject({ ok: false, code: "rank_taken", holder: { title: "Fake Album Holder" } });
    expect(getYearEntryByAlbum(db, album.id)).toMatchObject({ year: 2004, placement: "ranked", rank: 1 });
    expect(getImportReviewItem(db, review.id)!.status).toBe("open");
    expect(listImportReviewItems(db, "open")).toHaveLength(1);
  });

  it("can move an album that already holds the rank in the row's year", () => {
    const db = memoryDb();
    const album = createAlbum(db, { title: "Fake Album One", artist: { name: "Fake Artist A", catalogId: "art-a" }, catalogId: "cat-one" });
    addYearEntry(db, { albumId: album.id, year: 2001, placement: "ranked", rank: 3 });
    const review = item(db, { sourceDecadeRank: null });
    expect(resolveReviewItem(db, review.id, { kind: "catalog", album: CANDIDATE, moveHere: true }).ok).toBe(true);
  });
});
