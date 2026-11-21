import type { DatabaseSync } from "node:sqlite";
import { createAlbum, findAlbumByCatalogId, getAlbum } from "./db/albums";
import { transaction } from "./db/transaction";
import { DataError, type Placement } from "./db/types";
import { getYearEntryByAlbum, listAllYearEntries, listYear, setYearPlacements } from "./db/year-entries";
import { loadRatings } from "./ratings";
import { MAX_RANKED, type Area, type Placements } from "./year-placements";

export type YearAlbum = {
  id: number;
  title: string;
  artist: string;
  coverUrl: string | null;
  /** Rounded Elo rating. Null for a listed album, which has none. */
  rating: number | null;
};

export type YearView = {
  year: number;
  /** In rank order. `rank` is the stored rank, so a hand-edited gap shows as a gap. */
  ranked: (YearAlbum & { rank: number })[];
  /** Sorted by artist, then title. */
  honorableMentions: YearAlbum[];
  listed: YearAlbum[];
};

export type RemovedDecadeEntry = { decade: number; title: string };

export type YearSaved = { view: YearView; removedDecadeEntries: RemovedDecadeEntry[] };
export type YearActionResult = YearSaved | { error: string };

export type Conflict = { year: number; placement: Placement; rank: number | null; title: string };
export type AddResult = YearSaved | { error: string } | { conflict: Conflict };

export type YearSummary = { year: number; ranked: number; honorableMentions: number; listed: number };

const MIN_YEAR = 1900;
const MAX_YEAR = 2100;
const AREAS: Area[] = ["ranked", "honorable_mention", "listed"];
const COVER_HOST = "coverartarchive.org";
const MAX_TEXT = 300;
const MAX_CATALOG_ID = 100;

export function isValidYear(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= MIN_YEAR && (value as number) <= MAX_YEAR;
}

function isId(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0;
}

function text(value: unknown, max = MAX_TEXT): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" || trimmed.length > max ? null : trimmed;
}

function isCoverUrl(value: unknown): boolean {
  if (typeof value !== "string" || value.length > 500) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === COVER_HOST && url.username === "" && url.password === "";
  } catch {
    return false;
  }
}

class InputError extends Error {}

function bad(message: string): never {
  throw new InputError(message);
}

/** Runs `fn`, turning a refused input or a data rule violation into `{ error }`. Anything else is a bug and throws. */
function guarded<T>(fn: () => T): T | { error: string } {
  try {
    return fn();
  } catch (error) {
    if (error instanceof InputError || error instanceof DataError) return { error: error.message };
    throw error;
  }
}

const byArtistThenTitle = (a: YearAlbum, b: YearAlbum) =>
  a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title);

export function loadYearView(db: DatabaseSync, year: number): YearView {
  const { ratings } = loadRatings(db);
  const view: YearView = { year, ranked: [], honorableMentions: [], listed: [] };
  for (const entry of listYear(db, year)) {
    const album = getAlbum(db, entry.albumId)!;
    const rating = ratings.get(album.id);
    const card: YearAlbum = {
      id: album.id,
      title: album.title,
      artist: album.artist.name,
      coverUrl: album.coverUrl,
      rating: rating === undefined || entry.placement === "listed" ? null : Math.round(rating),
    };
    if (entry.placement === "ranked") view.ranked.push({ ...card, rank: entry.rank! });
    else if (entry.placement === "honorable_mention") view.honorableMentions.push(card);
    else view.listed.push(card);
  }
  view.ranked.sort((a, b) => a.rank - b.rank);
  view.honorableMentions.sort(byArtistThenTitle);
  view.listed.sort(byArtistThenTitle);
  return view;
}

/** Every year with at least one entry, oldest first, with the count in each area. */
export function listYears(db: DatabaseSync): YearSummary[] {
  const years = new Map<number, YearSummary>();
  for (const entry of listAllYearEntries(db)) {
    const summary = years.get(entry.year) ?? { year: entry.year, ranked: 0, honorableMentions: 0, listed: 0 };
    if (entry.placement === "ranked") summary.ranked += 1;
    else if (entry.placement === "honorable_mention") summary.honorableMentions += 1;
    else summary.listed += 1;
    years.set(entry.year, summary);
  }
  return [...years.values()].sort((a, b) => a.year - b.year);
}

function currentPlacements(db: DatabaseSync, year: number): Placements {
  const placements: Placements = { ranked: [], honorableMentions: [], listed: [] };
  for (const entry of listYear(db, year)) {
    if (entry.placement === "ranked") placements.ranked.push(entry.albumId);
    else if (entry.placement === "honorable_mention") placements.honorableMentions.push(entry.albumId);
    else placements.listed.push(entry.albumId);
  }
  return placements;
}

/** Writes the lists as ranks 1..n (closing any gap) and returns the year's new view. */
function write(
  db: DatabaseSync,
  year: number,
  placements: Placements,
  options: { moveFromOtherYears?: boolean } = {},
): YearSaved {
  const { removedDecadeEntries } = setYearPlacements(
    db,
    year,
    {
      ranked: placements.ranked.map((albumId, index) => ({ albumId, rank: index + 1 })),
      honorableMentions: placements.honorableMentions,
      listed: placements.listed,
    },
    options,
  );
  return {
    view: loadYearView(db, year),
    removedDecadeEntries: removedDecadeEntries.map((entry) => ({
      decade: entry.decade,
      title: getAlbum(db, entry.albumId)?.title ?? "Unknown album",
    })),
  };
}

function parseIds(value: unknown, what: string): number[] {
  if (!Array.isArray(value) || !value.every(isId)) bad(`The ${what} list wasn't valid. Reload the page.`);
  return value;
}

function parsePlacements(value: unknown): Placements {
  if (typeof value !== "object" || value === null) bad("The placements weren't valid. Reload the page.");
  const input = value as Record<string, unknown>;
  const placements = {
    ranked: parseIds(input.ranked, "ranked"),
    honorableMentions: parseIds(input.honorableMentions, "honorable mentions"),
    listed: parseIds(input.listed, "listed"),
  };
  if (placements.ranked.length > MAX_RANKED) bad(`Ranked holds at most ${MAX_RANKED} albums.`);
  const all = [...placements.ranked, ...placements.honorableMentions, ...placements.listed];
  if (new Set(all).size !== all.length) bad("An album appears more than once. Reload the page.");
  return placements;
}

function parseYear(value: unknown): number {
  if (!isValidYear(value)) bad(`Year must be a whole number from ${MIN_YEAR} to ${MAX_YEAR}.`);
  return value;
}

function parseArea(value: unknown): Area {
  if (!AREAS.includes(value as Area)) bad("Choose ranked, honorable mentions or listed.");
  return value as Area;
}

/** Saves a year's whole set of placements. Refuses bad input with a message and stores nothing. */
export function saveYear(db: DatabaseSync, year: unknown, placements: unknown): YearActionResult {
  return guarded(() => write(db, parseYear(year), parsePlacements(placements)));
}

const AREA_KEY = { ranked: "ranked", honorable_mention: "honorableMentions", listed: "listed" } as const;

/** Puts the album at the end of the area, or refuses when ranked is full. */
function append(placements: Placements, albumId: number, area: Area): Placements {
  if (area === "ranked" && placements.ranked.length >= MAX_RANKED) {
    bad("Ranked is full: add to honorable mentions or move one out first.");
  }
  const key = AREA_KEY[area];
  return { ...placements, [key]: [...placements[key], albumId] };
}

/** Places the album in this year, or reports where it already is. Run inside a transaction. */
function place(db: DatabaseSync, year: number, albumId: number, area: Area, move: boolean): AddResult {
  const entry = getYearEntryByAlbum(db, albumId);
  if (entry && entry.year === year) {
    bad(`${getAlbum(db, albumId)!.title} is already on this page.`);
  }
  if (entry && !move) {
    return {
      conflict: { year: entry.year, placement: entry.placement, rank: entry.rank, title: getAlbum(db, albumId)!.title },
    };
  }
  const placements = append(currentPlacements(db, year), albumId, area);
  return write(db, year, placements, { moveFromOtherYears: move });
}

/**
 * Adds a catalog search result to the year. Finds the album by catalog id or creates it, with the artist's catalog id when the result has one.
 * When the album is on another year and `move` is not set, stores nothing and returns the conflict.
 */
export function addFromCatalog(
  db: DatabaseSync,
  year: unknown,
  catalogAlbum: unknown,
  area: unknown,
  move: unknown = false,
): AddResult {
  return guarded(() => {
    const y = parseYear(year);
    const a = parseArea(area);
    if (typeof catalogAlbum !== "object" || catalogAlbum === null) bad("That album wasn't valid.");
    const input = catalogAlbum as Record<string, unknown>;
    const catalogId = text(input.catalogId, MAX_CATALOG_ID);
    const title = text(input.title);
    const artist = text(input.artist);
    if (catalogId === null || title === null || artist === null) bad("That album wasn't valid.");
    if (input.year !== null && input.year !== undefined && !Number.isInteger(input.year)) {
      bad("That album's release year wasn't valid.");
    }
    const artistId = input.artistId === null || input.artistId === undefined ? null : text(input.artistId, MAX_CATALOG_ID);
    if (input.artistId !== null && input.artistId !== undefined && artistId === null) bad("That album wasn't valid.");
    if (input.coverUrl !== null && input.coverUrl !== undefined && !isCoverUrl(input.coverUrl)) {
      bad("That album's cover wasn't valid.");
    }

    return transaction(db, () => {
      const album =
        findAlbumByCatalogId(db, catalogId) ??
        createAlbum(db, {
          title,
          artist: { name: artist, catalogId: artistId },
          catalogId,
          releaseYear: (input.year as number | null | undefined) ?? null,
          coverUrl: (input.coverUrl as string | null | undefined) ?? null,
        });
      return place(db, y, album.id, a, move === true);
    });
  });
}

/** Adds an album typed in by hand: no catalog id and no cover. */
export function addManual(db: DatabaseSync, year: unknown, input: unknown): AddResult {
  return guarded(() => {
    const y = parseYear(year);
    if (typeof input !== "object" || input === null) bad("That album wasn't valid.");
    const fields = input as Record<string, unknown>;
    const title = text(fields.title);
    const artist = text(fields.artist);
    if (title === null) bad("Enter a title (up to 300 characters).");
    if (artist === null) bad("Enter an artist (up to 300 characters).");
    const releaseYear = fields.releaseYear ?? null;
    if (releaseYear !== null && (!Number.isInteger(releaseYear) || (releaseYear as number) < 1 || (releaseYear as number) > MAX_YEAR)) {
      bad("Release year must be a whole number.");
    }
    const area = parseArea(fields.area);

    return transaction(db, () => {
      const album = createAlbum(db, { title, artist: { name: artist }, releaseYear: releaseYear as number | null });
      return place(db, y, album.id, area, false);
    });
  });
}
