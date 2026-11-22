import type { DatabaseSync } from "node:sqlite";
import { createAlbum, findAlbumByCatalogId } from "../db/albums.ts";
import { getImportReviewItem, resolveImportReviewItem, skipImportReviewItem } from "../db/import-review.ts";
import { addToLibrary, getLibraryEntry, setLibraryYear } from "../db/library.ts";
import { transaction } from "../db/transaction.ts";
import { DataError, type CatalogCandidate, type ImportReviewItem } from "../db/types.ts";

/** What the user picked for a review item. */
export type ResolveChoice =
  | {
      kind: "catalog";
      album: CatalogCandidate;
      /** The album is already in the library: set its library year and source to this row's. */
      moveHere?: boolean;
    }
  | { kind: "manual" };

export type ResolveFailure =
  | { ok: false; code: "not_found" | "not_open"; message: string }
  /** The chosen album is in the library already; offer "Move it here" (`moveHere: true`). */
  | { ok: false; code: "album_in_library"; message: string; albumId: number; year: number }
  | { ok: false; code: "invalid"; message: string };

export type ResolveSuccess = {
  ok: true;
  albumId: number;
  /** The library year the album had before "Move it here". */
  movedFromYear: number | null;
  item: ImportReviewItem;
};

export type ResolveResult = ResolveSuccess | ResolveFailure;

/** Thrown inside the transaction to roll it back and report a failure without changing anything. */
class Rollback extends Error {
  failure: ResolveFailure;

  constructor(failure: ResolveFailure) {
    super(failure.message);
    this.failure = failure;
  }
}

function openItem(db: DatabaseSync, itemId: number): ImportReviewItem {
  const item = getImportReviewItem(db, itemId);
  if (!item) throw new Rollback({ ok: false, code: "not_found", message: `Import review item ${itemId} does not exist.` });
  if (item.status !== "open") {
    throw new Rollback({ ok: false, code: "not_open", message: `This item is already ${item.status}.` });
  }
  return item;
}

/**
 * Applies the user's choice to an open review item in one transaction: creates or reuses the album, puts it
 * in the library with the row's year and source, and marks the item resolved. On any failure nothing
 * changes and the item stays open.
 */
export function resolveReviewItem(db: DatabaseSync, itemId: number, choice: ResolveChoice): ResolveResult {
  try {
    return transaction(db, (): ResolveSuccess => {
      const item = openItem(db, itemId);
      const existing = choice.kind === "catalog" ? findAlbumByCatalogId(db, choice.album.catalogId) : undefined;
      const entry = existing ? getLibraryEntry(db, existing.id) : undefined;
      if (existing && entry && choice.kind === "catalog" && !choice.moveHere) {
        throw new Rollback({
          ok: false,
          code: "album_in_library",
          message: `${existing.title} is already in your library (${entry.year}).`,
          albumId: existing.id,
          year: entry.year,
        });
      }

      let albumId: number;
      let movedFromYear: number | null = null;
      if (existing && entry) {
        albumId = existing.id;
        movedFromYear = entry.year;
        setLibraryYear(db, albumId, item.source.year, item.source);
      } else {
        albumId =
          existing?.id ??
          (choice.kind === "catalog"
            ? createAlbum(db, {
                title: choice.album.title,
                artist: { name: choice.album.artist, catalogId: choice.album.artistId ?? null },
                catalogId: choice.album.catalogId,
                releaseYear: choice.album.releaseYear,
                coverUrl: choice.album.coverUrl,
              })
            : createAlbum(db, {
                title: item.source.title,
                artist: { name: item.source.artist },
                releaseYear: item.source.year,
              })
          ).id;
        addToLibrary(db, { albumId, year: item.source.year, source: item.source });
      }

      return { ok: true, albumId, movedFromYear, item: resolveImportReviewItem(db, itemId, albumId) };
    });
  } catch (error) {
    if (error instanceof Rollback) return error.failure;
    if (error instanceof DataError) return { ok: false, code: "invalid", message: error.message };
    throw error;
  }
}

/** Marks an open review item skipped. Nothing is added. */
export function skipReviewItem(
  db: DatabaseSync,
  itemId: number,
): { ok: true; item: ImportReviewItem } | ResolveFailure {
  try {
    return transaction(db, () => {
      openItem(db, itemId);
      return { ok: true as const, item: skipImportReviewItem(db, itemId) };
    });
  } catch (error) {
    if (error instanceof Rollback) return error.failure;
    throw error;
  }
}
