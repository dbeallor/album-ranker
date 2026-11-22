import type { CatalogAlbum, CatalogQuery } from "../catalog/types.ts";
import type { CatalogCandidate, SourceRowKey } from "../db/types.ts";
import { gradeAndRank, gradeArtist, gradeTitle, type Grade } from "./grade.ts";
import type { CatalogSearch, ImportRow } from "./types.ts";

const NO_MATCH_CANDIDATES = 5;
/** A close match is only accepted when its year is this near the sheet's. */
const ACCEPT_YEAR_FIT = 1;

export type MatchOutcome =
  | { kind: "accepted"; album: CatalogAlbum }
  | { kind: "no_match"; candidates: CatalogCandidate[] }
  | { kind: "ambiguous"; candidates: CatalogCandidate[] };

export function toCandidate(album: CatalogAlbum): CatalogCandidate {
  return {
    catalogId: album.catalogId,
    title: album.title,
    artist: album.artist,
    artistId: album.artistId,
    releaseYear: album.year,
    coverUrl: album.coverUrl,
  };
}

const readAlbum = (album: CatalogAlbum) => ({ title: album.title, artist: album.artist, year: album.year });
const readCandidate = (candidate: CatalogCandidate) => ({
  title: candidate.title,
  artist: candidate.artist,
  year: candidate.releaseYear,
});

/** Exact or close. */
const isClose = (grade: Grade) => grade !== "none";

/**
 * Orders catalog albums for a sheet row, best first: title and artist grade, then how near the year is, then the
 * catalog's order. Used for the stored candidates and for the review page's search results.
 */
export function rankCandidates(row: { key: SourceRowKey }, albums: CatalogAlbum[]): CatalogAlbum[] {
  return gradeAndRank(row.key, albums, readAlbum).map((graded) => graded.item);
}

/** `rankCandidates` for the candidates stored on a review item, which name the year `releaseYear`. */
export function rankStoredCandidates(row: { key: SourceRowKey }, candidates: CatalogCandidate[]): CatalogCandidate[] {
  return gradeAndRank(row.key, candidates, readCandidate).map((graded) => graded.item);
}

/** Picks the catalog album for a row from its search results, or says why none can be picked. */
export function chooseMatch(row: ImportRow, results: CatalogAlbum[]): MatchOutcome {
  const ranked = gradeAndRank(row.key, results, readAlbum);

  const exact = ranked.filter((graded) => graded.title === "exact" && graded.artist === "exact");
  if (exact.length === 1) return { kind: "accepted", album: exact[0].item };
  if (exact.length > 1) {
    const near = exact.filter((graded) => graded.yearFit <= ACCEPT_YEAR_FIT);
    if (near.length === 1) return { kind: "accepted", album: near[0].item };
    return { kind: "ambiguous", candidates: exact.map((graded) => toCandidate(graded.item)) };
  }

  const usable = ranked.filter((graded) => isClose(graded.title) && isClose(graded.artist));
  if (usable.length === 1 && usable[0].yearFit <= ACCEPT_YEAR_FIT) return { kind: "accepted", album: usable[0].item };
  return {
    kind: "no_match",
    candidates: ranked.slice(0, NO_MATCH_CANDIDATES).map((graded) => toCandidate(graded.item)),
  };
}

type LadderStep = { query: CatalogQuery; keep?: (album: CatalogAlbum) => boolean };

/** The fallback searches for a row, in order: see `runLadder`. */
function ladderSteps(key: SourceRowKey): LadderStep[] {
  const titleFits = (album: CatalogAlbum) => isClose(gradeTitle(key.title, album.title));
  const artistFits = (album: CatalogAlbum) => isClose(gradeArtist(key.artist, album.artist));
  return [
    { query: { kind: "text", text: defaultSearchText(key) } },
    { query: { kind: "fields", title: key.title, artist: key.artist } },
    { query: { kind: "fields", title: key.title }, keep: artistFits },
    { query: { kind: "fields", artist: key.artist }, keep: titleFits },
  ];
}

/** The review page's search box starts with this text. */
export function defaultSearchText(key: SourceRowKey): string {
  return `${key.title} ${key.artist}`;
}

/**
 * Searches for a row until a step finds a result whose title and artist are both exact or close, and returns every
 * result gathered so far, deduped by catalog id. Each step is one catalog request:
 * 1. text "<album> <artist>";
 * 2. fields, title and artist (a typo, or extra artist words such as "Trio");
 * 3. fields, title only, keeping results whose artist is exact or close;
 * 4. fields, artist only, keeping results whose title is exact or close.
 * Rejects when the catalog can't answer.
 */
async function runLadder(key: SourceRowKey, search: CatalogSearch): Promise<CatalogAlbum[]> {
  const gathered = new Map<string, CatalogAlbum>();
  for (const step of ladderSteps(key)) {
    const kept = (await search(step.query)).filter((album) => step.keep?.(album) ?? true);
    for (const album of kept) {
      if (!gathered.has(album.catalogId)) gathered.set(album.catalogId, album);
    }
    const usable = gradeAndRank(key, kept, readAlbum).some((graded) => isClose(graded.title) && isClose(graded.artist));
    if (usable) break;
  }
  return [...gathered.values()];
}

/** Searches the catalog for a row with the fallback ladder and chooses. Rejects when the catalog can't answer. */
export async function matchRow(row: ImportRow, search: CatalogSearch): Promise<MatchOutcome> {
  return chooseMatch(row, await runLadder(row.key, search));
}

/**
 * What the review page's search box finds, ranked against the row. When the text is still the default
 * (`isDefault`, the text `defaultSearchText` gave), it runs the same ladder as the import. For text the user typed
 * it searches that text and, if that finds nothing, searches it as an album title. Rejects when the catalog can't
 * answer.
 */
export async function searchForReview(
  key: SourceRowKey,
  text: string,
  isDefault: boolean,
  search: CatalogSearch,
): Promise<CatalogAlbum[]> {
  if (isDefault) return rankCandidates({ key }, await runLadder(key, search));
  let results = await search({ kind: "text", text });
  if (results.length === 0) results = await search({ kind: "fields", title: text });
  return rankCandidates({ key }, results);
}
