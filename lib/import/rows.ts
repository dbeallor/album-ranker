import type { Placement } from "../db/types.ts";
import type { ImportRow, RawRow } from "./types.ts";

export type InvalidRow = { rowNumber: number; album: string; reason: string };

/** A row folded into an earlier row with the same key (ignoring case). `difference` is set when they disagreed. */
export type MergedRow = { row: ImportRow; keptRowNumber: number; difference: string | null };

export type PreparedRows = {
  /** Rows to import, duplicates merged, in sheet order. */
  rows: ImportRow[];
  /** Rows that are not blank: imported rows, merged duplicates and invalid rows. */
  rowsRead: number;
  invalid: InvalidRow[];
  merged: MergedRow[];
};

function text(cell: unknown): string {
  return cell === null || cell === undefined ? "" : String(cell).trim();
}

export function isBlankRow(raw: RawRow): boolean {
  return text(raw.album) === "" && text(raw.artist) === "" && text(raw.year) === "";
}

/** A whole number from a number cell or numeric text; null when the cell is empty; NaN when it is something else. */
function wholeNumber(cell: unknown): number | null {
  const value = text(cell);
  if (value === "") return null;
  if (typeof cell === "number") return Number.isInteger(cell) ? cell : NaN;
  return /^\d+$/.test(value) ? Number(value) : NaN;
}

/** The sheet marks an honorable mention with 1, TRUE, or any text but 0, no or false. */
export function isHonorableMention(cell: unknown): boolean {
  if (typeof cell === "boolean") return cell;
  if (typeof cell === "number") return cell !== 0 && !Number.isNaN(cell);
  const value = text(cell).toLowerCase();
  return !["", "0", "no", "false"].includes(value);
}

export type MapResult = { ok: true; row: ImportRow } | { ok: false; reason: string };

/** Validates a non-blank row and decides how it is imported. */
export function mapRow(raw: RawRow): MapResult {
  const title = text(raw.album);
  const artist = text(raw.artist);
  if (title === "") return { ok: false, reason: "missing album" };
  if (artist === "") return { ok: false, reason: "missing artist" };
  if (text(raw.year) === "") return { ok: false, reason: "missing year" };

  const year = wholeNumber(raw.year);
  if (year === null || Number.isNaN(year)) return { ok: false, reason: `year "${text(raw.year)}" is not a whole number` };
  if (year < 1900 || year > 2100) return { ok: false, reason: `year ${year} is outside 1900 to 2100` };

  const rank = wholeNumber(raw.rank);
  if (rank !== null && (Number.isNaN(rank) || rank < 1 || rank > 10)) {
    return { ok: false, reason: `rank "${text(raw.rank)}" is outside 1 to 10` };
  }
  // A bad decade rank costs the row only its decade rank: it is dropped and named, the row is still imported.
  const rawDecadeRank = wholeNumber(raw.decadeRank);
  let decadeRank: number | null = null;
  let droppedDecadeRank: string | null = null;
  if (rawDecadeRank !== null) {
    if (Number.isNaN(rawDecadeRank)) droppedDecadeRank = `decade rank "${text(raw.decadeRank)}" is not a whole number`;
    else if (rawDecadeRank < 1 || rawDecadeRank > 25) droppedDecadeRank = `decade rank ${rawDecadeRank} is outside 1 to 25`;
    else decadeRank = rawDecadeRank;
  }

  const honorableMention = isHonorableMention(raw.honorableMention);
  const placement: Placement = honorableMention ? "honorable_mention" : rank !== null ? "ranked" : "listed";
  if (decadeRank !== null && placement === "listed") {
    droppedDecadeRank = `decade rank ${decadeRank} on a listed album`;
    decadeRank = null;
  }

  return {
    ok: true,
    row: {
      rowNumber: raw.rowNumber,
      key: { title, artist, year },
      placement,
      rank: placement === "ranked" ? rank : null,
      decadeRank,
      conflictingPlacement: honorableMention && rank !== null ? { droppedRank: rank } : null,
      droppedDecadeRank,
    },
  };
}

function describePlacement(row: ImportRow): string {
  const base =
    row.placement === "ranked" ? `rank ${row.rank}` : row.placement === "honorable_mention" ? "honorable mention" : "listed";
  return row.decadeRank === null ? base : `${base}, decade rank ${row.decadeRank}`;
}

function duplicateKey(row: ImportRow): string {
  return JSON.stringify([row.key.title.toLowerCase(), row.key.artist.toLowerCase(), row.key.year]);
}

/** Reads the rows: skips blanks, validates, and folds rows with the same key (ignoring case) into the first. */
export function prepareRows(raw: RawRow[]): PreparedRows {
  const rows: ImportRow[] = [];
  const invalid: InvalidRow[] = [];
  const merged: MergedRow[] = [];
  const firstByKey = new Map<string, ImportRow>();
  let rowsRead = 0;

  for (const rawRow of raw) {
    if (isBlankRow(rawRow)) continue;
    rowsRead++;
    const result = mapRow(rawRow);
    if (!result.ok) {
      invalid.push({ rowNumber: rawRow.rowNumber, album: text(rawRow.album), reason: result.reason });
      continue;
    }
    const first = firstByKey.get(duplicateKey(result.row));
    if (first) {
      const differs = describePlacement(first) !== describePlacement(result.row);
      merged.push({
        row: result.row,
        keptRowNumber: first.rowNumber,
        difference: differs
          ? `rows differ, kept the first (${describePlacement(first)}), ignored (${describePlacement(result.row)})`
          : null,
      });
      continue;
    }
    firstByKey.set(duplicateKey(result.row), result.row);
    rows.push(result.row);
  }
  return { rows, rowsRead, invalid, merged };
}
