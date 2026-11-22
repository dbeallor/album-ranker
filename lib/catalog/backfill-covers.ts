// No `server-only` and only relative imports, so the backfill script can load this under Node's type stripping.
import type { DatabaseSync } from "node:sqlite";
import { isAllowedCoverUrl, type CoverLookup, type CoverQuery } from "./cover-art.ts";

const PROGRESS_EVERY = 25;

/** Every lookup, in either pass, starts at least this long after the previous one started. */
export const LOOKUP_GAP_MS = 1000;

const CAA_HOST = "coverartarchive.org";

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

export type LinkSummary = {
  /** Kept + replaced + still dead + failed. Skipped albums are not checked. */
  checked: number;
  /** The link works; nothing written. */
  kept: number;
  /** A dead link, now the Deezer cover. */
  replaced: number;
  /** A dead link and no matching cover on Deezer; the link stays. */
  stillDead: number;
  /** The check failed; the album is untouched and a rerun tries it again. */
  failed: number;
  /** No catalog id, or the stored link is not the album's own CAA `front-250` URL, so not checked. */
  skipped: number;
};

export type BackfillResult = { missing: BackfillSummary; links: LinkSummary };

export type BackfillDeps = {
  lookupCover: (query: CoverQuery) => Promise<CoverLookup>;
  /** Called after every `PROGRESS_EVERY` albums of a pass. */
  onProgress?: (done: number, total: number) => void;
  /** Waits between lookups. Defaults to a real timer. */
  sleep?: (ms: number) => Promise<void>;
  /** The clock the pace is measured on. Defaults to `Date.now`. */
  now?: () => number;
};

type MissingRow = { id: number; title: string; catalog_id: string | null; artist_name: string };
type LinkRow = MissingRow & { cover_url: string };

/** Returns a function to await before each lookup; it waits so each lookup starts `LOOKUP_GAP_MS` after the last one. */
function createPacer(deps: BackfillDeps): () => Promise<void> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = deps.now ?? Date.now;
  let lastStart: number | null = null;
  return async () => {
    if (lastStart !== null) {
      const wait = lastStart + LOOKUP_GAP_MS - now();
      if (wait > 0) await sleep(wait);
    }
    lastStart = now();
  };
}

function isCaaLink(value: string): boolean {
  if (!isAllowedCoverUrl(value)) return false;
  return new URL(value).hostname === CAA_HOST;
}

/**
 * Two passes, one album at a time and in id order. First it fills `cover_url` for albums that have none. Then it checks
 * each album whose cover is its own Cover Art Archive link, and replaces a dead one with the Deezer cover. A cover
 * that works is never changed, and a cover stored while a lookup was running is never overwritten.
 */
export async function backfillCovers(db: DatabaseSync, deps: BackfillDeps): Promise<BackfillResult> {
  const select = (where: string) =>
    db
      .prepare(
        `SELECT al.id, al.title, al.catalog_id, al.cover_url, ar.name AS artist_name
         FROM albums al JOIN artists ar ON ar.id = al.artist_id
         WHERE ${where} ORDER BY al.id`,
      )
      .all();
  // Both lists are read before anything is written, so a cover the first pass fills is not checked again by the second.
  const missingRows = select("al.cover_url IS NULL") as MissingRow[];
  const linkRows = (select("al.cover_url IS NOT NULL") as LinkRow[]).filter((row) => isCaaLink(row.cover_url));
  const pace = createPacer(deps);

  return { missing: await fillMissing(db, deps, pace, missingRows), links: await replaceDeadLinks(db, deps, pace, linkRows) };
}

async function fillMissing(db: DatabaseSync, deps: BackfillDeps, pace: () => Promise<void>, rows: MissingRow[]): Promise<BackfillSummary> {
  const fill = db.prepare("UPDATE albums SET cover_url = ? WHERE id = ? AND cover_url IS NULL");
  const summary: BackfillSummary = { total: rows.length, filled: 0, none: 0, failed: 0, skipped: 0 };

  for (const [index, row] of rows.entries()) {
    if (row.catalog_id === null) {
      summary.skipped++;
    } else {
      await pace();
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

async function replaceDeadLinks(db: DatabaseSync, deps: BackfillDeps, pace: () => Promise<void>, rows: LinkRow[]): Promise<LinkSummary> {
  // The old link is the last value, so a cover changed since it was read is never overwritten.
  const replace = db.prepare("UPDATE albums SET cover_url = ? WHERE id = ? AND cover_url = ?");
  const summary: LinkSummary = { checked: 0, kept: 0, replaced: 0, stillDead: 0, failed: 0, skipped: 0 };

  for (const [index, row] of rows.entries()) {
    // The lookup checks the URL built from the catalog id, so it only judges this link when the two are the same.
    const catalogId = row.catalog_id;
    if (catalogId === null || row.cover_url !== `https://${CAA_HOST}/release-group/${catalogId.toLowerCase()}/front-250`) {
      summary.skipped++;
    } else {
      await pace();
      const result = await deps.lookupCover({ catalogId, title: row.title, artist: row.artist_name });
      summary.checked++;
      if (result.kind === "failed") summary.failed++;
      else if (result.kind === "none") summary.stillDead++;
      else if (result.url === row.cover_url) summary.kept++;
      else if (!isAllowedCoverUrl(result.url)) summary.stillDead++;
      else if (Number(replace.run(result.url, row.id, row.cover_url).changes) > 0) summary.replaced++;
      else summary.kept++;
    }
    if ((index + 1) % PROGRESS_EVERY === 0) deps.onProgress?.(index + 1, rows.length);
  }
  return summary;
}

/** The text the script prints at the end of a run. */
export function formatBackfillSummary({ missing, links }: BackfillResult): string {
  const line = (label: string, count: number, note = "") => `${label.padEnd(12)}${String(count).padStart(3)}${note ? `   ${note}` : ""}`;
  return [
    "Missing covers",
    line("Filled:", missing.filled),
    line("Still none:", missing.none, "(no cover on CAA or a matching one on Deezer)"),
    line("Failed:", missing.failed, "(a lookup failed; run again to retry)"),
    line("Skipped:", missing.skipped, "(no catalog id)"),
    "",
    "Cover Art Archive links",
    line("Checked:", links.checked),
    line("Kept:", links.kept, "(the link works)"),
    line("Replaced:", links.replaced, "(dead link, now the Deezer cover)"),
    line("Still dead:", links.stillDead, "(dead link, no matching cover on Deezer; left as it is)"),
    line("Failed:", links.failed, "(a check failed; run again to retry)"),
    line("Skipped:", links.skipped, "(no catalog id, or not this album's own CAA link)"),
  ].join("\n");
}
