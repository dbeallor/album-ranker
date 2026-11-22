// No `server-only` and only relative imports, so the backfill script can load this under Node's type stripping.
import type { DatabaseSync } from "node:sqlite";
import { isAllowedCoverUrl, type CoverLookup, type CoverQuery } from "./cover-art.ts";

const PROGRESS_EVERY = 25;

export type BackfillSummary = {
  /** Albums with no cover when the run started, including the skipped ones. */
  total: number;
  filled: number;
  /** Looked up, and neither the Cover Art Archive nor Deezer has a matching cover. */
  none: number;
  /** A lookup failed; the album is untouched and a rerun tries it again. */
  failed: number;
  /** No catalog id, so not looked up. */
  skipped: number;
};

export type BackfillDeps = {
  lookupCover: (query: CoverQuery) => Promise<CoverLookup>;
  /** Called after every `PROGRESS_EVERY` albums. */
  onProgress?: (done: number, total: number) => void;
};

type Row = { id: number; title: string; catalog_id: string | null; artist_name: string };

/**
 * Fills `cover_url` for albums that have none, one album at a time and in id order. Albums that already have a
 * cover are never looked up, and a cover stored while a lookup was running is never overwritten.
 */
export async function backfillCovers(db: DatabaseSync, deps: BackfillDeps): Promise<BackfillSummary> {
  const rows = db
    .prepare(
      `SELECT al.id, al.title, al.catalog_id, ar.name AS artist_name
       FROM albums al JOIN artists ar ON ar.id = al.artist_id
       WHERE al.cover_url IS NULL ORDER BY al.id`,
    )
    .all() as Row[];
  const fill = db.prepare("UPDATE albums SET cover_url = ? WHERE id = ? AND cover_url IS NULL");
  const summary: BackfillSummary = { total: rows.length, filled: 0, none: 0, failed: 0, skipped: 0 };

  for (const [index, row] of rows.entries()) {
    if (row.catalog_id === null) {
      summary.skipped++;
    } else {
      const result = await deps.lookupCover({ catalogId: row.catalog_id, title: row.title, artist: row.artist_name });
      if (result.kind === "failed") summary.failed++;
      else if (result.kind === "none" || !isAllowedCoverUrl(result.url)) summary.none++;
      // Zero changes means an add stored a cover meanwhile; that cover stays and the album is not counted as filled.
      else if (Number(fill.run(result.url, row.id).changes) > 0) summary.filled++;
    }
    if ((index + 1) % PROGRESS_EVERY === 0) deps.onProgress?.(index + 1, rows.length);
  }
  return summary;
}

/** The text the script prints at the end of a run. */
export function formatBackfillSummary(summary: BackfillSummary): string {
  const line = (label: string, count: number, note = "") => `${label.padEnd(12)}${String(count).padStart(3)}${note ? `   ${note}` : ""}`;
  return [
    line("Filled:", summary.filled),
    line("Still none:", summary.none, "(no cover on CAA or a matching one on Deezer)"),
    line("Failed:", summary.failed, "(a lookup failed; run again to retry)"),
    line("Skipped:", summary.skipped, "(no catalog id)"),
  ].join("\n");
}
