import type { DatabaseSync } from "node:sqlite";
import type { CoverQuery } from "../catalog/cover-art.ts";
import { CatalogError } from "../catalog/musicbrainz.ts";
import type { CatalogAlbum } from "../catalog/types.ts";
import { findAlbumByCatalogId } from "../db/albums.ts";
import { findImportReviewItem, listImportReviewItems } from "../db/import-review.ts";
import { findLibraryEntryBySource } from "../db/library.ts";
import type { ReviewReason } from "../db/types.ts";
import { matchRow, type MatchOutcome } from "./match.ts";
import type { InvalidRow, MergedRow, PreparedRows } from "./rows.ts";
import type { CatalogSearch, ImportRow } from "./types.ts";
import { writeRow, type RowResult } from "./write-row.ts";

/** Waits before the first and second retry of a catalog search that failed. */
export const RETRY_DELAYS_MS = [5000, 15000];
export const MAX_CONSECUTIVE_FAILURES = 10;
export const PROGRESS_EVERY = 25;

export type RunDeps = {
  search: CatalogSearch;
  sleep: (ms: number) => Promise<void>;
  /**
   * Looks up the cover to store for an accepted row whose album isn't stored yet (null: store none). When
   * omitted, the catalog's own cover URL is kept.
   */
  resolveCover?: (query: CoverQuery) => Promise<string | null>;
  /** Called after every `PROGRESS_EVERY` rows. */
  onProgress?: (done: number, total: number) => void;
  /** Called for each catalog failure that is retried or given up on. */
  onCatalogError?: (row: ImportRow, error: unknown) => void;
};

export type ImportSummary = {
  rowsRead: number;
  imported: number;
  review: Record<ReviewReason, number>;
  merged: MergedRow[];
  conflictingPlacement: ImportRow[];
  alreadyImported: number;
  invalid: InvalidRow[];
  notReached: number;
  /** Open review items in the database, from this run or an earlier one. */
  openReviewItems: number;
  /** The run stopped after too many catalog failures in a row. */
  aborted: boolean;
};

/**
 * Searches for a row, retrying when the catalog fails. Answers already received are kept across the retries, so a
 * retry asks the catalog again only for the step that failed, not for the steps before it.
 */
async function searchWithRetries(row: ImportRow, deps: RunDeps) {
  const answers = new Map<string, CatalogAlbum[]>();
  const search: CatalogSearch = async (query) => {
    const key = JSON.stringify(query);
    const known = answers.get(key);
    if (known) return known;
    const albums = await deps.search(query);
    answers.set(key, albums);
    return albums;
  };
  for (let attempt = 0; ; attempt++) {
    try {
      return { ok: true as const, outcome: await matchRow(row, search) };
    } catch (error) {
      // Only catalog failures are worth retrying; a bug or a database error must surface, not read as "not reached".
      if (!(error instanceof CatalogError)) throw error;
      deps.onCatalogError?.(row, error);
      if (attempt >= RETRY_DELAYS_MS.length) return { ok: false as const };
      await deps.sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
}

/** Swaps an accepted album's catalog cover for the resolved one, unless there is no resolver or the album is stored (it keeps its cover). */
async function withCover(db: DatabaseSync, outcome: MatchOutcome, deps: RunDeps): Promise<MatchOutcome> {
  if (outcome.kind !== "accepted" || !deps.resolveCover) return outcome;
  const { album } = outcome;
  if (findAlbumByCatalogId(db, album.catalogId)) return outcome;
  const coverUrl = await deps.resolveCover({ catalogId: album.catalogId, title: album.title, artist: album.artist });
  return { kind: "accepted", album: { ...album, coverUrl } };
}

/** Imports the prepared rows one at a time, each in its own transaction, and returns what happened. */
export async function runImport(db: DatabaseSync, prepared: PreparedRows, deps: RunDeps): Promise<ImportSummary> {
  const summary: ImportSummary = {
    rowsRead: prepared.rowsRead,
    imported: 0,
    review: { no_match: 0, ambiguous: 0, duplicate_album: 0, rank_taken: 0 },
    merged: prepared.merged,
    conflictingPlacement: [],
    alreadyImported: 0,
    invalid: prepared.invalid,
    notReached: 0,
    openReviewItems: 0,
    aborted: false,
  };

  let failuresInARow = 0;
  const { rows } = prepared;
  for (const [index, row] of rows.entries()) {
    if (failuresInARow >= MAX_CONSECUTIVE_FAILURES) {
      summary.aborted = true;
      summary.notReached += rows.length - index;
      break;
    }

    if (findLibraryEntryBySource(db, row.key) || findImportReviewItem(db, row.key)) {
      summary.alreadyImported++;
    } else {
      const searched = await searchWithRetries(row, deps);
      if (!searched.ok) {
        failuresInARow++;
        summary.notReached++;
      } else {
        failuresInARow = 0;
        record(summary, row, writeRow(db, row, await withCover(db, searched.outcome, deps)));
      }
    }

    if ((index + 1) % PROGRESS_EVERY === 0) deps.onProgress?.(index + 1, rows.length);
  }

  summary.openReviewItems = listImportReviewItems(db, "open").length;
  return summary;
}

function record(summary: ImportSummary, row: ImportRow, result: RowResult): void {
  if (row.conflictingPlacement) summary.conflictingPlacement.push(row);
  if (result.kind === "review") {
    summary.review[result.reason]++;
  } else {
    summary.imported++;
  }
}
