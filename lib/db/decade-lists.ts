import type { DatabaseSync } from "node:sqlite";
import type { DecadeListEntry } from "./types";

type Row = Record<string, unknown>;

function toEntry(row: Row): DecadeListEntry {
  return {
    id: row.id as number,
    decade: row.decade as number,
    albumId: row.album_id as number,
    position: row.position as number,
  };
}

export function decadeOf(year: number): number {
  return Math.floor(year / 10) * 10;
}

/** Replaces a decade's entries with these albums in this order, positions 1 to n. */
function rewriteDecade(db: DatabaseSync, decade: number, albumIds: number[]): void {
  db.prepare("DELETE FROM decade_list_entries WHERE decade = ?").run(decade);
  const insert = db.prepare("INSERT INTO decade_list_entries (decade, album_id, position) VALUES (?, ?, ?)");
  albumIds.forEach((albumId, index) => insert.run(decade, albumId, index + 1));
}

/**
 * Deletes the decade list entries of these albums that no longer have a ranked or honorable mention
 * year entry in that decade, and closes the gaps they leave. Joins the caller's transaction.
 */
export function removeIneligibleDecadeEntries(db: DatabaseSync, albumIds: number[]): DecadeListEntry[] {
  const removed: DecadeListEntry[] = [];
  const lookup = db.prepare("SELECT * FROM decade_list_entries WHERE album_id = ?");
  const eligible = db.prepare(
    `SELECT 1 FROM year_entries
     WHERE album_id = ? AND placement IN ('ranked', 'honorable_mention') AND year >= ? AND year < ?`,
  );
  for (const albumId of new Set(albumIds)) {
    const row = lookup.get(albumId);
    if (!row) continue;
    const entry = toEntry(row);
    if (eligible.get(albumId, entry.decade, entry.decade + 10)) continue;
    removed.push(entry);
  }

  for (const decade of new Set(removed.map((entry) => entry.decade))) {
    const gone = new Set(removed.filter((entry) => entry.decade === decade).map((entry) => entry.albumId));
    const keep = getDecadeList(db, decade)
      .map((entry) => entry.albumId)
      .filter((albumId) => !gone.has(albumId));
    rewriteDecade(db, decade, keep);
  }
  return removed;
}

export function getDecadeList(db: DatabaseSync, decade: number): DecadeListEntry[] {
  return db
    .prepare("SELECT * FROM decade_list_entries WHERE decade = ? ORDER BY position")
    .all(decade)
    .map(toEntry);
}
