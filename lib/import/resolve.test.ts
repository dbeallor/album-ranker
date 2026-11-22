import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createAlbum, findAlbumByCatalogId, listAlbums } from "../db/albums.ts";
import {
  createImportReviewItem,
  getImportReviewItem,
  listImportReviewItems,
  type CreateImportReviewItemInput,
} from "../db/import-review.ts";
import { addToLibrary, getLibraryEntry, listLibrary } from "../db/library.ts";
import { memoryDb } from "../db/test-db.ts";
import type { CatalogCandidate } from "../db/types.ts";
import { resolveReviewItem, skipReviewItem } from "./resolve.ts";

const CANDIDATE: CatalogCandidate = {
  catalogId: "cat-one",
  title: "Fake Album One",
  artist: "Fake Artist A",
  artistId: "art-a",
  releaseYear: 2001,
  coverUrl: "https://covers.test/cat-one",
};

const SOURCE = { title: "Fake Albm One", artist: "Fake Artist A", year: 2001 };

function item(db: DatabaseSync, over: Partial<CreateImportReviewItemInput> = {}) {
  return createImportReviewItem(db, {
    source: SOURCE,
    sourcePlacement: "ranked",
    sourceRank: 3,
    sourceDecadeRank: 2,
    candidates: [CANDIDATE],
    ...over,
  });
}

function catalogAlbumInLibrary(db: DatabaseSync, year: number) {
  const album = createAlbum(db, { title: "Fake Album One", artist: { name: "Fake Artist A", catalogId: "art-a" }, catalogId: "cat-one" });
  addToLibrary(db, { albumId: album.id, year });
  return album;
}

describe("resolving an item", () => {
  it("creates the album and artist from the catalog, adds it to the library with the row's year and source, and resolves the item", () => {
    const db = memoryDb();
    const review = item(db);

    const result = resolveReviewItem(db, review.id, { kind: "catalog", album: CANDIDATE });

    expect(result).toMatchObject({ ok: true, movedFromYear: null });
    if (!result.ok) return;
    const album = findAlbumByCatalogId(db, "cat-one")!;
    expect(album).toMatchObject({
      id: result.albumId,
      title: "Fake Album One",
      releaseYear: 2001,
      coverUrl: "https://covers.test/cat-one",
      artist: { name: "Fake Artist A", catalogId: "art-a" },
    });
    expect(getLibraryEntry(db, album.id)).toMatchObject({ year: 2001, source: SOURCE }); // the sheet's text, not the catalog's
    expect(getImportReviewItem(db, review.id)).toMatchObject({ status: "resolved", resolvedAlbumId: album.id });
  });

  it("keeps a manual album built from the row as written in the sheet", () => {
    const db = memoryDb();
    const review = item(db);

    expect(resolveReviewItem(db, review.id, { kind: "manual" }).ok).toBe(true);

    const [album] = listAlbums(db);
    expect(album).toMatchObject({
      title: "Fake Albm One",
      artist: { name: "Fake Artist A", catalogId: null },
      catalogId: null,
      releaseYear: 2001,
      coverUrl: null,
    });
    expect(getLibraryEntry(db, album.id)).toMatchObject({ year: 2001, source: SOURCE });
    expect(getImportReviewItem(db, review.id)).toMatchObject({ status: "resolved", resolvedAlbumId: album.id });
  });

  it.each([
    { name: "a ranked row", over: {} },
    { name: "an honorable mention", over: { sourcePlacement: "honorable_mention" as const, sourceRank: null } },
    { name: "a listed row", over: { sourcePlacement: "listed" as const, sourceRank: null, sourceDecadeRank: null } },
  ])("adds $name whatever its rank, even when another album has the same rank", ({ over }) => {
    const db = memoryDb();
    const other = createAlbum(db, { title: "Other", artist: { name: "Other Artist" } });
    addToLibrary(db, { albumId: other.id, year: 2001 });
    expect(resolveReviewItem(db, item(db, over).id, { kind: "catalog", album: CANDIDATE }).ok).toBe(true);
    expect(listLibrary(db)).toHaveLength(2);
  });

  it("shares the artist with an album already in the catalog from the same artist", () => {
    const db = memoryDb();
    createAlbum(db, { title: "Other", artist: { name: "Fake Artist A", catalogId: "art-a" }, catalogId: "cat-other" });
    resolveReviewItem(db, item(db).id, { kind: "catalog", album: CANDIDATE });
    expect(new Set(listAlbums(db).map((a) => a.artist.id)).size).toBe(1);
  });

  it("reuses the manual artist of the same name", () => {
    const db = memoryDb();
    resolveReviewItem(db, item(db).id, { kind: "manual" });
    resolveReviewItem(db, item(db, { source: { title: "Fake Album Two", artist: "Fake Artist A", year: 2002 } }).id, { kind: "manual" });
    expect(new Set(listAlbums(db).map((a) => a.artist.id)).size).toBe(1);
  });

  it("reuses an album that is not in the library", () => {
    const db = memoryDb();
    const existing = createAlbum(db, { title: "Fake Album One", artist: { name: "Fake Artist A", catalogId: "art-a" }, catalogId: "cat-one" });
    const result = resolveReviewItem(db, item(db).id, { kind: "catalog", album: CANDIDATE });
    expect(result).toMatchObject({ ok: true, albumId: existing.id });
    expect(listAlbums(db)).toHaveLength(1);
  });
});

describe("an album already in the library", () => {
  it("says which year it is in and does not move it by default", () => {
    const db = memoryDb();
    const album = catalogAlbumInLibrary(db, 2004);
    const review = item(db);

    const result = resolveReviewItem(db, review.id, { kind: "catalog", album: CANDIDATE });

    expect(result).toEqual({
      ok: false,
      code: "album_in_library",
      message: "Fake Album One is already in your library (2004).",
      albumId: album.id,
      year: 2004,
    });
    expect(getLibraryEntry(db, album.id)).toMatchObject({ year: 2004, source: null });
    expect(getImportReviewItem(db, review.id)!.status).toBe("open");
  });

  it("sets its library year and source to the row's when told to move it here", () => {
    const db = memoryDb();
    const album = catalogAlbumInLibrary(db, 2004);
    const review = item(db);

    const result = resolveReviewItem(db, review.id, { kind: "catalog", album: CANDIDATE, moveHere: true });

    expect(result).toMatchObject({ ok: true, albumId: album.id, movedFromYear: 2004 });
    expect(getLibraryEntry(db, album.id)).toMatchObject({ year: 2001, source: SOURCE });
    expect(listAlbums(db)).toHaveLength(1);
    expect(getImportReviewItem(db, review.id)).toMatchObject({ status: "resolved", resolvedAlbumId: album.id });
  });
});

describe("skipping and items that can't be resolved", () => {
  it("skipping marks the item skipped and adds nothing", () => {
    const db = memoryDb();
    const review = item(db);
    expect(skipReviewItem(db, review.id)).toMatchObject({ ok: true, item: { status: "skipped", resolvedAlbumId: null } });
    expect(listAlbums(db)).toEqual([]);
    expect(listLibrary(db)).toEqual([]);
  });

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
    expect(listImportReviewItems(db, "open")).toHaveLength(0);
  });
});
