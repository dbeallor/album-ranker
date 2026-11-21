import type { DatabaseSync } from "node:sqlite";
import { now, transaction } from "./transaction";
import { DataError, type Album, type Artist } from "./types";

type Row = Record<string, unknown>;

const ALBUM_SELECT = `
  SELECT al.id, al.title, al.catalog_id, al.release_year, al.cover_url, al.created_at,
         ar.id AS artist_id, ar.name AS artist_name, ar.catalog_id AS artist_catalog_id
  FROM albums al JOIN artists ar ON ar.id = al.artist_id`;

function toArtist(row: Row): Artist {
  return { id: row.id as number, name: row.name as string, catalogId: row.catalog_id as string | null };
}

function toAlbum(row: Row): Album {
  return {
    id: row.id as number,
    title: row.title as string,
    artist: {
      id: row.artist_id as number,
      name: row.artist_name as string,
      catalogId: row.artist_catalog_id as string | null,
    },
    catalogId: row.catalog_id as string | null,
    releaseYear: row.release_year as number | null,
    coverUrl: row.cover_url as string | null,
    createdAt: row.created_at as string,
  };
}

export type ArtistInput = { name: string; catalogId?: string | null };

export type AlbumInput = {
  title: string;
  artist: ArtistInput;
  catalogId?: string | null;
  releaseYear?: number | null;
  coverUrl?: string | null;
};

/** Reuses the artist with this catalog id, or (for a manual artist) this exact name; otherwise creates one. */
export function findOrCreateArtist(db: DatabaseSync, input: ArtistInput): Artist {
  const name = input.name.trim();
  if (name === "") throw new DataError("invalid_input", "Artist name is required.");
  const catalogId = input.catalogId ?? null;

  const existing =
    catalogId === null
      ? db.prepare("SELECT * FROM artists WHERE catalog_id IS NULL AND name = ?").get(name)
      : db.prepare("SELECT * FROM artists WHERE catalog_id = ?").get(catalogId);
  if (existing) return toArtist(existing);

  const { lastInsertRowid } = db
    .prepare("INSERT INTO artists (name, catalog_id) VALUES (?, ?)")
    .run(name, catalogId);
  return { id: Number(lastInsertRowid), name, catalogId };
}

export function getAlbum(db: DatabaseSync, id: number): Album | undefined {
  const row = db.prepare(`${ALBUM_SELECT} WHERE al.id = ?`).get(id);
  return row ? toAlbum(row) : undefined;
}

export function findAlbumByCatalogId(db: DatabaseSync, catalogId: string): Album | undefined {
  const row = db.prepare(`${ALBUM_SELECT} WHERE al.catalog_id = ?`).get(catalogId);
  return row ? toAlbum(row) : undefined;
}

export function listAlbums(db: DatabaseSync): Album[] {
  return db.prepare(`${ALBUM_SELECT} ORDER BY al.id`).all().map(toAlbum);
}

function assertCatalogIdFree(db: DatabaseSync, catalogId: string, exceptAlbumId?: number): void {
  const owner = findAlbumByCatalogId(db, catalogId);
  if (owner && owner.id !== exceptAlbumId) {
    throw new DataError("catalog_id_taken", `Catalog id ${catalogId} already belongs to another album.`);
  }
}

function deleteArtistIfOrphaned(db: DatabaseSync, artistId: number): void {
  db.prepare(
    "DELETE FROM artists WHERE id = ? AND NOT EXISTS (SELECT 1 FROM albums WHERE artist_id = artists.id)",
  ).run(artistId);
}

export function createAlbum(db: DatabaseSync, input: AlbumInput): Album {
  const title = input.title.trim();
  if (title === "") throw new DataError("invalid_input", "Album title is required.");
  const catalogId = input.catalogId ?? null;

  return transaction(db, () => {
    if (catalogId !== null) assertCatalogIdFree(db, catalogId);
    const artist = findOrCreateArtist(db, input.artist);
    const { lastInsertRowid } = db
      .prepare(
        "INSERT INTO albums (title, artist_id, catalog_id, release_year, cover_url, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(title, artist.id, catalogId, input.releaseYear ?? null, input.coverUrl ?? null, now());
    return getAlbum(db, Number(lastInsertRowid))!;
  });
}

/** Deletes the album (its year entry, matchups and decade list entry cascade) and its artist if no albums remain. */
export function deleteAlbum(db: DatabaseSync, id: number): boolean {
  return transaction(db, () => {
    const album = getAlbum(db, id);
    if (!album) return false;
    db.prepare("DELETE FROM albums WHERE id = ?").run(id);
    deleteArtistIfOrphaned(db, album.artist.id);
    return true;
  });
}

export type CatalogAlbum = {
  catalogId: string;
  title: string;
  artist: { name: string; catalogId: string };
  releaseYear: number | null;
  coverUrl: string | null;
};

/** Points a manual album at a catalog album, keeping its id and everything attached to it. */
export function linkToCatalog(db: DatabaseSync, albumId: number, catalog: CatalogAlbum): Album {
  return transaction(db, () => {
    const album = getAlbum(db, albumId);
    if (!album) throw new DataError("not_found", `Album ${albumId} does not exist.`);
    assertCatalogIdFree(db, catalog.catalogId, albumId);

    const artist = findOrCreateArtist(db, catalog.artist);
    db.prepare(
      "UPDATE albums SET catalog_id = ?, title = ?, artist_id = ?, release_year = ?, cover_url = ? WHERE id = ?",
    ).run(catalog.catalogId, catalog.title.trim(), artist.id, catalog.releaseYear, catalog.coverUrl, albumId);
    if (album.artist.id !== artist.id) deleteArtistIfOrphaned(db, album.artist.id);
    return getAlbum(db, albumId)!;
  });
}
