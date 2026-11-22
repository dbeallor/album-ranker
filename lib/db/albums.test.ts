import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createAlbum, deleteAlbum, getAlbum, linkToCatalog, listAlbums } from "./albums";
import { errorCode, memoryDb } from "./test-db";

const TS = "2020-01-01T00:00:00.000Z";

/** Attaches a library entry and a matchup (against a second album) using plain SQL. */
function attachRows(db: DatabaseSync, albumId: number): number {
  const other = createAlbum(db, { title: "Other", artist: { name: "Someone Else" } });
  db.prepare("INSERT INTO library_albums (album_id, year, added_at) VALUES (?, 1999, ?)").run(albumId, TS);
  db.prepare(
    "INSERT INTO matchups (album_a_id, album_b_id, result, created_at) VALUES (?, ?, 'a', ?)",
  ).run(albumId, other.id, TS);
  return other.id;
}

function count(db: DatabaseSync, table: string): number {
  return Number(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()!.n);
}

const catalog = {
  catalogId: "mb-1",
  title: "OK Computer",
  artist: { name: "Radiohead", catalogId: "mb-artist-1" },
  releaseYear: 1997,
  coverUrl: "https://example.test/ok.jpg",
};

describe("albums", () => {
  it("creates a manual album without a catalog id and reuses its artist by name", () => {
    const db = memoryDb();
    const a = createAlbum(db, { title: "Demo", artist: { name: "Local Band" } });
    const b = createAlbum(db, { title: "Demo 2", artist: { name: "Local Band" } });
    expect(a).toMatchObject({ title: "Demo", catalogId: null, releaseYear: null, coverUrl: null });
    expect(a.artist.id).toBe(b.artist.id);
    expect(listAlbums(db)).toHaveLength(2);
  });

  it("linking to the catalog keeps the album id, library entry and matchups", () => {
    const db = memoryDb();
    const album = createAlbum(db, { title: "ok computer", artist: { name: "radiohead" } });
    attachRows(db, album.id);

    const linked = linkToCatalog(db, album.id, catalog);

    expect(linked).toMatchObject({
      id: album.id,
      title: "OK Computer",
      catalogId: "mb-1",
      releaseYear: 1997,
      coverUrl: "https://example.test/ok.jpg",
      artist: { name: "Radiohead", catalogId: "mb-artist-1" },
    });
    expect(count(db, "library_albums")).toBe(1);
    expect(count(db, "matchups")).toBe(1);
    expect(db.prepare("SELECT name FROM artists WHERE name = 'radiohead'").get()).toBeUndefined();
  });

  it("rejects linking to a catalog id that belongs to another album", () => {
    const db = memoryDb();
    createAlbum(db, { title: "OK Computer", artist: catalog.artist, catalogId: "mb-1" });
    const manual = createAlbum(db, { title: "Mine", artist: { name: "Me" } });
    expect(errorCode(() => linkToCatalog(db, manual.id, catalog))).toBe("catalog_id_taken");
    expect(getAlbum(db, manual.id)!.catalogId).toBeNull();
  });

  it("deleting an album cascades to its library entry and matchups, and drops an orphaned artist", () => {
    const db = memoryDb();
    const album = createAlbum(db, { title: "Doomed", artist: { name: "Gone" } });
    const otherId = attachRows(db, album.id);

    expect(deleteAlbum(db, album.id)).toBe(true);

    expect(count(db, "library_albums")).toBe(0);
    expect(count(db, "matchups")).toBe(0);
    expect(db.prepare("SELECT 1 FROM artists WHERE name = 'Gone'").get()).toBeUndefined();
    expect(getAlbum(db, otherId)).toBeDefined();
    expect(deleteAlbum(db, album.id)).toBe(false);
  });
});
