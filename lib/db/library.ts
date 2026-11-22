import type { DatabaseSync } from "node:sqlite";
import { now, transaction } from "./transaction.ts";
import { DataError, type LibraryEntry, type SourceRowKey } from "./types.ts";

type Row = Record<string, unknown>;

function toEntry(row: Row): LibraryEntry {
  return {
    albumId: row.album_id as number,
    year: row.year as number,
    addedAt: row.added_at as string,
    source:
      row.source_title === null
        ? null
        : {
            title: row.source_title as string,
            artist: row.source_artist as string,
            year: row.source_year as number,
          },
  };
}

function checkYear(year: number): void {
  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    throw new DataError("invalid_input", `Year must be a whole number from 1900 to 2100, got ${year}.`);
  }
}

function assertSourceFree(db: DatabaseSync, source: SourceRowKey | null, exceptAlbumId?: number): void {
  if (!source) return;
  const holder = findLibraryEntryBySource(db, source);
  if (holder && holder.albumId !== exceptAlbumId) {
    throw new DataError("invalid_input", "A library album for this source row already exists.");
  }
}

/** Every library album, by year then album id. */
export function listLibrary(db: DatabaseSync): LibraryEntry[] {
  return db.prepare("SELECT * FROM library_albums ORDER BY year, album_id").all().map(toEntry);
}

export function getLibraryEntry(db: DatabaseSync, albumId: number): LibraryEntry | undefined {
  const row = db.prepare("SELECT * FROM library_albums WHERE album_id = ?").get(albumId);
  return row ? toEntry(row) : undefined;
}

/** The library year of each of these catalog ids that is in the library; ids not in the library are left out. */
export function libraryYearsByCatalogId(db: DatabaseSync, catalogIds: string[]): Map<string, number> {
  if (catalogIds.length === 0) return new Map();
  const placeholders = catalogIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT al.catalog_id, la.year FROM albums al JOIN library_albums la ON la.album_id = al.id
       WHERE al.catalog_id IN (${placeholders})`,
    )
    .all(...catalogIds);
  return new Map(rows.map((row) => [row.catalog_id as string, row.year as number]));
}

/** The library album an import row produced, by its source key (exact text, as stored). */
export function findLibraryEntryBySource(db: DatabaseSync, source: SourceRowKey): LibraryEntry | undefined {
  const row = db
    .prepare("SELECT * FROM library_albums WHERE source_title = ? AND source_artist = ? AND source_year = ?")
    .get(source.title, source.artist, source.year);
  return row ? toEntry(row) : undefined;
}

export type AddToLibraryInput = { albumId: number; year: number; source?: SourceRowKey | null };

export function addToLibrary(db: DatabaseSync, input: AddToLibraryInput): LibraryEntry {
  return transaction(db, () => {
    checkYear(input.year);
    if (!db.prepare("SELECT 1 FROM albums WHERE id = ?").get(input.albumId)) {
      throw new DataError("not_found", `Album ${input.albumId} does not exist.`);
    }
    if (getLibraryEntry(db, input.albumId)) {
      throw new DataError("album_in_library", `Album ${input.albumId} is already in the library.`);
    }
    const source = input.source ?? null;
    assertSourceFree(db, source);
    db.prepare(
      `INSERT INTO library_albums (album_id, year, added_at, source_title, source_artist, source_year)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(input.albumId, input.year, now(), source?.title ?? null, source?.artist ?? null, source?.year ?? null);
    return getLibraryEntry(db, input.albumId)!;
  });
}

/** Moves the album to another library year. `source` replaces the stored sheet row (null clears it); leave it out to keep it. */
export function setLibraryYear(
  db: DatabaseSync,
  albumId: number,
  year: number,
  source?: SourceRowKey | null,
): LibraryEntry {
  return transaction(db, () => {
    checkYear(year);
    if (!getLibraryEntry(db, albumId)) {
      throw new DataError("not_found", `Album ${albumId} is not in the library.`);
    }
    if (source === undefined) {
      db.prepare("UPDATE library_albums SET year = ? WHERE album_id = ?").run(year, albumId);
    } else {
      assertSourceFree(db, source, albumId);
      db.prepare(
        "UPDATE library_albums SET year = ?, source_title = ?, source_artist = ?, source_year = ? WHERE album_id = ?",
      ).run(year, source?.title ?? null, source?.artist ?? null, source?.year ?? null, albumId);
    }
    return getLibraryEntry(db, albumId)!;
  });
}
