import type { DatabaseSync } from "node:sqlite";
import { removeIneligibleDecadeEntries } from "./decade-lists.ts";
import { now, transaction } from "./transaction.ts";
import {
  DataError,
  type DecadeListEntry,
  type Placement,
  type SourceRowKey,
  type YearEntry,
} from "./types.ts";

type Row = Record<string, unknown>;

const PLACEMENTS: Placement[] = ["ranked", "honorable_mention", "listed"];
const MAX_RANK = 10;

const ORDER = `ORDER BY year,
  CASE placement WHEN 'ranked' THEN 0 WHEN 'honorable_mention' THEN 1 ELSE 2 END, rank, id`;

function toEntry(row: Row): YearEntry {
  const source =
    row.source_title === null
      ? null
      : {
          title: row.source_title as string,
          artist: row.source_artist as string,
          year: row.source_year as number,
        };
  return {
    id: row.id as number,
    albumId: row.album_id as number,
    year: row.year as number,
    placement: row.placement as Placement,
    rank: row.rank as number | null,
    source,
    sourceDecadeRank: row.source_decade_rank as number | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/** A year entry change plus the decade list entries it removed (rule 7), so the screen can tell the user. */
export type YearChange = { entry: YearEntry; removedDecadeEntries: DecadeListEntry[] };

function checkYear(year: number): void {
  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    throw new DataError("invalid_input", `Year must be a whole number from 1900 to 2100, got ${year}.`);
  }
}

function checkPlacement(placement: Placement, rank: number | null | undefined): number | null {
  if (!PLACEMENTS.includes(placement)) {
    throw new DataError("invalid_input", `Unknown placement ${String(placement)}.`);
  }
  if (placement === "ranked") {
    if (rank === null || rank === undefined || !Number.isInteger(rank) || rank < 1 || rank > MAX_RANK) {
      throw new DataError("invalid_rank", `A ranked album needs a rank from 1 to ${MAX_RANK}.`);
    }
    return rank;
  }
  if (rank !== null && rank !== undefined) {
    throw new DataError("invalid_rank", `A ${placement} album has no rank.`);
  }
  return null;
}

function assertRankFree(db: DatabaseSync, year: number, rank: number | null, exceptAlbumId?: number): void {
  if (rank === null) return;
  const holder = db.prepare("SELECT album_id FROM year_entries WHERE year = ? AND rank = ?").get(year, rank);
  if (holder && holder.album_id !== exceptAlbumId) {
    throw new DataError("rank_taken", `Rank ${rank} in ${year} is already taken.`);
  }
}

function assertAlbumExists(db: DatabaseSync, albumId: number): void {
  if (!db.prepare("SELECT 1 FROM albums WHERE id = ?").get(albumId)) {
    throw new DataError("not_found", `Album ${albumId} does not exist.`);
  }
}

/** The album that holds this rank in this year, if any. */
export function findRankHolder(db: DatabaseSync, year: number, rank: number): number | undefined {
  const row = db.prepare("SELECT album_id FROM year_entries WHERE year = ? AND rank = ?").get(year, rank);
  return row ? (row.album_id as number) : undefined;
}

/** The year entry an import row produced, by its source key (exact text, as stored). */
export function findYearEntryBySource(db: DatabaseSync, source: SourceRowKey): YearEntry | undefined {
  const row = db
    .prepare("SELECT * FROM year_entries WHERE source_title = ? AND source_artist = ? AND source_year = ?")
    .get(source.title, source.artist, source.year);
  return row ? toEntry(row) : undefined;
}

/** Replaces the source decade rank the album's year entry keeps for ordering decade list insertions. */
export function setSourceDecadeRank(db: DatabaseSync, albumId: number, rank: number | null): void {
  if (rank !== null && (!Number.isInteger(rank) || rank < 1 || rank > 25)) {
    throw new DataError("invalid_input", `Source decade rank must be from 1 to 25, got ${rank}.`);
  }
  requireEntry(db, albumId);
  db.prepare("UPDATE year_entries SET source_decade_rank = ? WHERE album_id = ?").run(rank, albumId);
}

export function getYearEntryByAlbum(db: DatabaseSync, albumId: number): YearEntry | undefined {
  const row = db.prepare("SELECT * FROM year_entries WHERE album_id = ?").get(albumId);
  return row ? toEntry(row) : undefined;
}

/** A year's entries: ranked by rank, then honorable mentions, then listed. */
export function listYear(db: DatabaseSync, year: number): YearEntry[] {
  return db.prepare(`SELECT * FROM year_entries WHERE year = ? ${ORDER}`).all(year).map(toEntry);
}

export function listAllYearEntries(db: DatabaseSync): YearEntry[] {
  return db.prepare(`SELECT * FROM year_entries ${ORDER}`).all().map(toEntry);
}

export type AddYearEntryInput = {
  albumId: number;
  year: number;
  placement: Placement;
  rank?: number | null;
  source?: SourceRowKey | null;
  /** The decade rank the imported sheet gave this album, kept for ordering later insertions. */
  sourceDecadeRank?: number | null;
};

export function addYearEntry(db: DatabaseSync, input: AddYearEntryInput): YearEntry {
  return transaction(db, () => {
    checkYear(input.year);
    const rank = checkPlacement(input.placement, input.rank);
    assertAlbumExists(db, input.albumId);
    if (getYearEntryByAlbum(db, input.albumId)) {
      throw new DataError("album_has_year_entry", `Album ${input.albumId} already has a year entry.`);
    }
    assertRankFree(db, input.year, rank);
    const sourceDecadeRank = input.sourceDecadeRank ?? null;
    if (sourceDecadeRank !== null && (!Number.isInteger(sourceDecadeRank) || sourceDecadeRank < 1 || sourceDecadeRank > 25)) {
      throw new DataError("invalid_input", `Source decade rank must be from 1 to 25, got ${sourceDecadeRank}.`);
    }

    const source = input.source ?? null;
    if (
      source &&
      db
        .prepare("SELECT 1 FROM year_entries WHERE source_title = ? AND source_artist = ? AND source_year = ?")
        .get(source.title, source.artist, source.year)
    ) {
      throw new DataError("invalid_input", "A year entry for this source row already exists.");
    }

    const stamp = now();
    db.prepare(
      `INSERT INTO year_entries
         (album_id, year, placement, rank, source_title, source_artist, source_year, source_decade_rank,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.albumId,
      input.year,
      input.placement,
      rank,
      source?.title ?? null,
      source?.artist ?? null,
      source?.year ?? null,
      sourceDecadeRank,
      stamp,
      stamp,
    );
    return getYearEntryByAlbum(db, input.albumId)!;
  });
}

function changeEntry(
  db: DatabaseSync,
  albumId: number,
  year: number,
  placement: Placement,
  rankInput: number | null | undefined,
): YearChange {
  checkYear(year);
  const rank = checkPlacement(placement, rankInput);
  assertRankFree(db, year, rank, albumId);
  db.prepare("UPDATE year_entries SET year = ?, placement = ?, rank = ?, updated_at = ? WHERE album_id = ?").run(
    year,
    placement,
    rank,
    now(),
    albumId,
  );
  return {
    entry: getYearEntryByAlbum(db, albumId)!,
    removedDecadeEntries: removeIneligibleDecadeEntries(db, [albumId]),
  };
}

function requireEntry(db: DatabaseSync, albumId: number): YearEntry {
  const entry = getYearEntryByAlbum(db, albumId);
  if (!entry) throw new DataError("not_found", `Album ${albumId} has no year entry.`);
  return entry;
}

/** Changes the placement and rank within the entry's year. */
export function updateYearEntry(
  db: DatabaseSync,
  albumId: number,
  change: { placement: Placement; rank?: number | null },
): YearChange {
  return transaction(db, () => {
    const current = requireEntry(db, albumId);
    return changeEntry(db, albumId, current.year, change.placement, change.rank);
  });
}

/** Moves the album's year entry to another year, keeping placement and rank unless `target` says otherwise. */
export function moveYearEntry(
  db: DatabaseSync,
  albumId: number,
  year: number,
  target?: { placement: Placement; rank?: number | null },
): YearChange {
  return transaction(db, () => {
    const current = requireEntry(db, albumId);
    return changeEntry(
      db,
      albumId,
      year,
      target?.placement ?? current.placement,
      target ? target.rank : current.rank,
    );
  });
}

/** Removes the album's year entry. Other ranks stay where they are. */
export function removeYearEntry(db: DatabaseSync, albumId: number): YearChange {
  return transaction(db, () => {
    const entry = requireEntry(db, albumId);
    db.prepare("DELETE FROM year_entries WHERE album_id = ?").run(albumId);
    return { entry, removedDecadeEntries: removeIneligibleDecadeEntries(db, [albumId]) };
  });
}

export type YearPlacements = {
  ranked: { albumId: number; rank: number }[];
  honorableMentions: number[];
  listed: number[];
};

/**
 * Replaces a year's entries with these lists in one transaction. Albums dropped from the lists lose their
 * year entry. An album with an entry in another year is rejected unless `moveFromOtherYears` is set.
 */
export function setYearPlacements(
  db: DatabaseSync,
  year: number,
  placements: YearPlacements,
  options: { moveFromOtherYears?: boolean } = {},
): { entries: YearEntry[]; removedDecadeEntries: DecadeListEntry[] } {
  return transaction(db, () => {
    checkYear(year);
    const wanted: { albumId: number; placement: Placement; rank: number | null }[] = [
      ...placements.ranked.map(({ albumId, rank }) => ({
        albumId,
        placement: "ranked" as const,
        rank: checkPlacement("ranked", rank),
      })),
      ...placements.honorableMentions.map((albumId) => ({
        albumId,
        placement: "honorable_mention" as const,
        rank: null,
      })),
      ...placements.listed.map((albumId) => ({ albumId, placement: "listed" as const, rank: null })),
    ];

    const albumIds = new Set<number>();
    const ranks = new Set<number>();
    for (const item of wanted) {
      if (albumIds.has(item.albumId)) {
        throw new DataError("invalid_input", `Album ${item.albumId} appears more than once.`);
      }
      albumIds.add(item.albumId);
      if (item.rank !== null) {
        if (ranks.has(item.rank)) throw new DataError("rank_taken", `Rank ${item.rank} is used twice.`);
        ranks.add(item.rank);
      }
      assertAlbumExists(db, item.albumId);
    }

    const existing = db
      .prepare("SELECT * FROM year_entries")
      .all()
      .map(toEntry)
      .filter((entry) => entry.year === year || albumIds.has(entry.albumId));
    for (const entry of existing) {
      if (entry.year !== year && !options.moveFromOtherYears) {
        throw new DataError("album_has_year_entry", `Album ${entry.albumId} already has an entry in ${entry.year}.`);
      }
    }

    const previous = new Map(existing.map((entry) => [entry.albumId, entry]));
    const remove = db.prepare("DELETE FROM year_entries WHERE id = ?");
    for (const entry of existing) remove.run(entry.id);

    const insert = db.prepare(
      `INSERT INTO year_entries
         (album_id, year, placement, rank, source_title, source_artist, source_year, source_decade_rank,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const stamp = now();
    for (const item of wanted) {
      const before = previous.get(item.albumId);
      insert.run(
        item.albumId,
        year,
        item.placement,
        item.rank,
        before?.source?.title ?? null,
        before?.source?.artist ?? null,
        before?.source?.year ?? null,
        before?.sourceDecadeRank ?? null,
        before?.createdAt ?? stamp,
        stamp,
      );
    }

    return {
      entries: listYear(db, year),
      removedDecadeEntries: removeIneligibleDecadeEntries(db, [...previous.keys(), ...albumIds]),
    };
  });
}
