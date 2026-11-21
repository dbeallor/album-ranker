import type { DatabaseSync } from "node:sqlite";
import { listAlbums } from "./db/albums";
import { decadeOf, getDecadeList, listDecadeLists, setDecadeList } from "./db/decade-lists";
import { DataError } from "./db/types";
import { listAllYearEntries } from "./db/year-entries";
import { MAX_LIST, decadeSummaries, sortByRating, suggestDecadeList, type DecadeSummary } from "./decades";
import { loadRatings } from "./ratings";

export type DecadeRow = {
  albumId: number;
  title: string;
  artist: string;
  /** The year page year, not the catalog release year. */
  year: number;
  coverUrl: string | null;
  /** The replayed rating, rounded. */
  rating: number;
};

export type DecadeView = {
  decade: number;
  list: DecadeRow[];
  /** What the ratings suggest; only set while the decade has no list. Never stored. */
  suggestion: DecadeRow[] | null;
  /** Eligible albums not on the list, highest rated first. */
  panel: DecadeRow[];
  /** Every ranked or honorable mention album in the decade, on the list or not. */
  eligibleCount: number;
};

/** An error, and the current view when the caller's copy is stale. */
export type DecadeActionResult = DecadeView | { error: string; view?: DecadeView };

function isId(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0;
}

function checkDecade(decade: unknown): string | null {
  if (!Number.isInteger(decade) || (decade as number) % 10 !== 0 || (decade as number) < 1900 || (decade as number) > 2100) {
    return "That decade isn't valid.";
  }
  return null;
}

function checkIds(albumIds: unknown): string | null {
  if (!Array.isArray(albumIds) || !albumIds.every(isId)) return "That list wasn't valid. Reload the page.";
  if (albumIds.length > MAX_LIST) return `A decade list holds at most ${MAX_LIST} albums.`;
  if (new Set(albumIds).size !== albumIds.length) return "An album can be on a decade list only once.";
  return null;
}

/** One picker row per decade with any year entry or list entry, oldest first. */
export function loadDecadePicker(db: DatabaseSync): DecadeSummary[] {
  return decadeSummaries(listAllYearEntries(db), listDecadeLists(db));
}

/** Reads only. A decade with no list gets a suggestion; nothing is stored. */
export function loadDecadeView(db: DatabaseSync, decade: number): DecadeView {
  const { ratings } = loadRatings(db);
  const albums = new Map(listAlbums(db).map((album) => [album.id, album]));
  const eligible: (DecadeRow & { albumId: number })[] = [];
  for (const entry of listAllYearEntries(db)) {
    const album = albums.get(entry.albumId);
    const rating = ratings.get(entry.albumId);
    if (entry.placement === "listed" || !album || rating === undefined || decadeOf(entry.year) !== decade) continue;
    eligible.push({
      albumId: album.id,
      title: album.title,
      artist: album.artist.name,
      year: entry.year,
      coverUrl: album.coverUrl,
      rating,
    });
  }

  const byId = new Map(eligible.map((row) => [row.albumId, row]));
  const rounded = (row: DecadeRow): DecadeRow => ({ ...row, rating: Math.round(row.rating) });
  const list = getDecadeList(db, decade)
    .map((entry) => byId.get(entry.albumId))
    .filter((row) => row !== undefined)
    .map(rounded);

  const listed = new Set(list.map((row) => row.albumId));
  const panel = sortByRating(eligible.filter((row) => !listed.has(row.albumId))).map(rounded);
  const suggestion =
    list.length === 0
      ? suggestDecadeList(eligible).map((id) => rounded(byId.get(id)!))
      : null;

  return { decade, list, suggestion, panel, eligibleCount: eligible.length };
}

function save(db: DatabaseSync, decade: number, albumIds: number[]): DecadeActionResult {
  try {
    setDecadeList(db, decade, albumIds);
  } catch (error) {
    if (error instanceof DataError) return { error: error.message };
    throw error;
  }
  return loadDecadeView(db, decade);
}

/** Stores the whole list, in this order. Returns the new view, or an error and stores nothing. */
export function saveDecadeList(db: DatabaseSync, decade: unknown, albumIds: unknown): DecadeActionResult {
  const problem = checkDecade(decade) ?? checkIds(albumIds);
  if (problem) return { error: problem };
  return save(db, decade as number, albumIds as number[]);
}

/** Saves the ids the user saw as the list, only if the decade still has no list. */
export function acceptSuggestion(db: DatabaseSync, decade: unknown, albumIds: unknown): DecadeActionResult {
  const problem = checkDecade(decade) ?? checkIds(albumIds);
  if (problem) return { error: problem };
  if (getDecadeList(db, decade as number).length > 0) {
    return { error: "This decade already has a list.", view: loadDecadeView(db, decade as number) };
  }
  return save(db, decade as number, albumIds as number[]);
}
