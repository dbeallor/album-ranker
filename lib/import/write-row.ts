import type { DatabaseSync } from "node:sqlite";
import { createAlbum, findAlbumByCatalogId } from "../db/albums.ts";
import { createImportReviewItem } from "../db/import-review.ts";
import { addToLibrary, getLibraryEntry } from "../db/library.ts";
import { transaction } from "../db/transaction.ts";
import type { CatalogCandidate, ReviewReason } from "../db/types.ts";
import { toCandidate, type MatchOutcome } from "./match.ts";
import type { ImportRow } from "./types.ts";

export type RowResult = { kind: "imported"; albumId: number } | { kind: "review"; reason: ReviewReason };

function review(
  db: DatabaseSync,
  row: ImportRow,
  reason: ReviewReason,
  candidates: CatalogCandidate[],
  reasonDetail: string | null = null,
): RowResult {
  createImportReviewItem(db, {
    source: row.key,
    sourcePlacement: row.placement,
    sourceRank: row.rank,
    sourceDecadeRank: row.decadeRank,
    reason,
    reasonDetail,
    candidates,
  });
  return { kind: "review", reason };
}

/**
 * Writes one matched row in its own transaction: the album and artist (shared by catalog artist id) and its
 * library entry with the sheet row as its source; or a review item saying why not. The sheet's rank,
 * honorable mention flag and decade rank are not used.
 */
export function writeRow(db: DatabaseSync, row: ImportRow, outcome: MatchOutcome): RowResult {
  return transaction(db, () => {
    if (outcome.kind !== "accepted") return review(db, row, outcome.kind, outcome.candidates);

    const catalog = outcome.album;
    const existing = findAlbumByCatalogId(db, catalog.catalogId);
    const inLibrary = existing ? getLibraryEntry(db, existing.id) : undefined;
    if (inLibrary) return review(db, row, "duplicate_album", [toCandidate(catalog)], String(inLibrary.year));

    const album =
      existing ??
      createAlbum(db, {
        title: catalog.title,
        artist: { name: catalog.artist, catalogId: catalog.artistId },
        catalogId: catalog.catalogId,
        releaseYear: catalog.year,
        coverUrl: catalog.coverUrl,
      });
    addToLibrary(db, { albumId: album.id, year: row.key.year, source: row.key });
    return { kind: "imported", albumId: album.id };
  });
}
