import type { DatabaseSync } from "node:sqlite";
import { CatalogError } from "../catalog/musicbrainz.ts";
import { listDecadeLists } from "../db/decade-lists.ts";
import { findImportReviewItem, listImportReviewItems } from "../db/import-review.ts";
import type { ReviewReason } from "../db/types.ts";
import { findYearEntryBySource } from "../db/year-entries.ts";
import { matchRow } from "./match.ts";
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
  droppedDecadeRank: ImportRow[];
  alreadyImported: number;
  invalid: InvalidRow[];
  notReached: number;
  /** Rows imported but left off a decade list because it already had 25 albums. */
  decadeListFull: ImportRow[];
  /** Entries now on each decade list in the database, oldest decade first. */
  decadeLists: { decade: number; entries: number }[];
  /** Open review items in the database, from this run or an earlier one. */
  openReviewItems: number;
  /** The run stopped after too many catalog failures in a row. */
  aborted: boolean;
};

async function searchWithRetries(row: ImportRow, deps: RunDeps) {
  for (let attempt = 0; ; attempt++) {
    try {
      return { ok: true as const, outcome: await matchRow(row, deps.search) };
    } catch (error) {
      // Only catalog failures are worth retrying; a bug or a database error must surface, not read as "not reached".
      if (!(error instanceof CatalogError)) throw error;
      deps.onCatalogError?.(row, error);
      if (attempt >= RETRY_DELAYS_MS.length) return { ok: false as const };
      await deps.sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
}

function countDecadeLists(db: DatabaseSync): ImportSummary["decadeLists"] {
  const counts = new Map<number, number>();
  for (const entry of listDecadeLists(db)) counts.set(entry.decade, (counts.get(entry.decade) ?? 0) + 1);
  return [...counts].map(([decade, entries]) => ({ decade, entries })).sort((a, b) => a.decade - b.decade);
}

/** Imports the prepared rows one at a time, each in its own transaction, and returns what happened. */
export async function runImport(db: DatabaseSync, prepared: PreparedRows, deps: RunDeps): Promise<ImportSummary> {
  const summary: ImportSummary = {
    rowsRead: prepared.rowsRead,
    imported: 0,
    review: { no_match: 0, ambiguous: 0, duplicate_album: 0, rank_taken: 0 },
    merged: prepared.merged,
    conflictingPlacement: [],
    droppedDecadeRank: [],
    alreadyImported: 0,
    invalid: prepared.invalid,
    notReached: 0,
    decadeListFull: [],
    decadeLists: [],
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

    if (findYearEntryBySource(db, row.key) || findImportReviewItem(db, row.key)) {
      summary.alreadyImported++;
    } else {
      const searched = await searchWithRetries(row, deps);
      if (!searched.ok) {
        failuresInARow++;
        summary.notReached++;
      } else {
        failuresInARow = 0;
        record(summary, row, writeRow(db, row, searched.outcome));
      }
    }

    if ((index + 1) % PROGRESS_EVERY === 0) deps.onProgress?.(index + 1, rows.length);
  }

  summary.decadeLists = countDecadeLists(db);
  summary.openReviewItems = listImportReviewItems(db, "open").length;
  return summary;
}

function record(summary: ImportSummary, row: ImportRow, result: RowResult): void {
  if (row.conflictingPlacement) summary.conflictingPlacement.push(row);
  if (row.droppedDecadeRank !== null) summary.droppedDecadeRank.push(row);
  if (result.kind === "review") {
    summary.review[result.reason]++;
  } else {
    summary.imported++;
    if (result.decade === "full") summary.decadeListFull.push(row);
  }
}
