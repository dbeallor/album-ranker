import type { DatabaseSync } from "node:sqlite";
import { now, transaction } from "./transaction";
import {
  DataError,
  type CatalogCandidate,
  type ImportReviewItem,
  type Placement,
  type ReviewStatus,
  type SourceRowKey,
} from "./types";

type Row = Record<string, unknown>;

function toItem(row: Row): ImportReviewItem {
  return {
    id: row.id as number,
    source: {
      title: row.source_title as string,
      artist: row.source_artist as string,
      year: row.source_year as number,
    },
    sourcePlacement: row.source_placement as Placement,
    sourceRank: row.source_rank as number | null,
    sourceDecadeRank: row.source_decade_rank as number | null,
    candidates: JSON.parse(row.candidates as string) as CatalogCandidate[],
    status: row.status as ReviewStatus,
    resolvedAlbumId: row.resolved_album_id as number | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export type CreateImportReviewItemInput = {
  source: SourceRowKey;
  sourcePlacement: Placement;
  sourceRank?: number | null;
  sourceDecadeRank?: number | null;
  candidates: CatalogCandidate[];
};

export function findImportReviewItem(db: DatabaseSync, source: SourceRowKey): ImportReviewItem | undefined {
  const row = db
    .prepare("SELECT * FROM import_review_items WHERE source_title = ? AND source_artist = ? AND source_year = ?")
    .get(source.title, source.artist, source.year);
  return row ? toItem(row) : undefined;
}

export function createImportReviewItem(db: DatabaseSync, input: CreateImportReviewItemInput): ImportReviewItem {
  return transaction(db, () => {
    if (findImportReviewItem(db, input.source)) {
      throw new DataError("invalid_input", "A review item for this source row already exists.");
    }
    const stamp = now();
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO import_review_items
           (source_title, source_artist, source_year, source_placement, source_rank, source_decade_rank,
            candidates, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
      )
      .run(
        input.source.title,
        input.source.artist,
        input.source.year,
        input.sourcePlacement,
        input.sourceRank ?? null,
        input.sourceDecadeRank ?? null,
        JSON.stringify(input.candidates),
        stamp,
        stamp,
      );
    return getItem(db, Number(lastInsertRowid));
  });
}

function getItem(db: DatabaseSync, id: number): ImportReviewItem {
  const row = db.prepare("SELECT * FROM import_review_items WHERE id = ?").get(id);
  if (!row) throw new DataError("not_found", `Import review item ${id} does not exist.`);
  return toItem(row);
}

export function listImportReviewItems(db: DatabaseSync, status?: ReviewStatus): ImportReviewItem[] {
  const rows =
    status === undefined
      ? db.prepare("SELECT * FROM import_review_items ORDER BY id").all()
      : db.prepare("SELECT * FROM import_review_items WHERE status = ? ORDER BY id").all(status);
  return rows.map(toItem);
}

function setStatus(db: DatabaseSync, id: number, status: ReviewStatus, albumId: number | null): ImportReviewItem {
  return transaction(db, () => {
    getItem(db, id);
    if (albumId !== null && !db.prepare("SELECT 1 FROM albums WHERE id = ?").get(albumId)) {
      throw new DataError("not_found", `Album ${albumId} does not exist.`);
    }
    db.prepare("UPDATE import_review_items SET status = ?, resolved_album_id = ?, updated_at = ? WHERE id = ?").run(
      status,
      albumId,
      now(),
      id,
    );
    return getItem(db, id);
  });
}

/** Marks the item resolved with the album it ended up as. The row stays so a re-import skips it. */
export function resolveImportReviewItem(db: DatabaseSync, id: number, albumId: number): ImportReviewItem {
  return setStatus(db, id, "resolved", albumId);
}

/** Marks the item skipped. The row stays so a re-import skips it. */
export function skipImportReviewItem(db: DatabaseSync, id: number): ImportReviewItem {
  return setStatus(db, id, "skipped", null);
}
