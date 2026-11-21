import type { DatabaseSync } from "node:sqlite";
import { createAlbum, findAlbumByCatalogId, getAlbum } from "../db/albums.ts";
import { decadeOf, insertIntoDecadeBySourceRank } from "../db/decade-lists.ts";
import { createImportReviewItem } from "../db/import-review.ts";
import { transaction } from "../db/transaction.ts";
import type { CatalogCandidate, ReviewReason } from "../db/types.ts";
import { addYearEntry, findRankHolder, getYearEntryByAlbum } from "../db/year-entries.ts";
import { toCandidate, type MatchOutcome } from "./match.ts";
import type { ImportRow } from "./types.ts";

export type DecadeOutcome = "none" | "inserted" | "already_listed" | "full";

export type RowResult =
  | { kind: "imported"; albumId: number; decade: DecadeOutcome }
  | { kind: "review"; reason: ReviewReason };

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
 * Writes one matched row in its own transaction: the album and artist (shared by catalog artist id), the
 * year entry with the sheet row as its source and its decade list entry; or a review item saying why not.
 */
export function writeRow(db: DatabaseSync, row: ImportRow, outcome: MatchOutcome): RowResult {
  return transaction(db, () => {
    if (outcome.kind !== "accepted") return review(db, row, outcome.kind, outcome.candidates);

    const catalog = outcome.album;
    const candidate = toCandidate(catalog);
    const existing = findAlbumByCatalogId(db, catalog.catalogId);
    const onYear = existing ? getYearEntryByAlbum(db, existing.id) : undefined;
    if (onYear) return review(db, row, "duplicate_album", [candidate], String(onYear.year));

    if (row.rank !== null) {
      const holder = findRankHolder(db, row.key.year, row.rank);
      if (holder !== undefined) {
        const held = getAlbum(db, holder)!;
        return review(db, row, "rank_taken", [candidate], `${held.title} - ${held.artist.name}`);
      }
    }

    const album =
      existing ??
      createAlbum(db, {
        title: catalog.title,
        artist: { name: catalog.artist, catalogId: catalog.artistId },
        catalogId: catalog.catalogId,
        releaseYear: catalog.year,
        coverUrl: catalog.coverUrl,
      });
    addYearEntry(db, {
      albumId: album.id,
      year: row.key.year,
      placement: row.placement,
      rank: row.rank,
      source: row.key,
      sourceDecadeRank: row.decadeRank,
    });

    if (row.decadeRank === null) return { kind: "imported", albumId: album.id, decade: "none" };
    const inserted = insertIntoDecadeBySourceRank(db, album.id, decadeOf(row.key.year));
    return { kind: "imported", albumId: album.id, decade: inserted.status };
  });
}
