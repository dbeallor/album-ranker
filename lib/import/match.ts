import type { CatalogAlbum } from "../catalog/types.ts";
import type { CatalogCandidate } from "../db/types.ts";
import { normalizeText } from "./normalize.ts";
import type { CatalogSearch, ImportRow } from "./types.ts";

const NO_MATCH_CANDIDATES = 5;

/** A catalog album about to be stored: the cover may have been looked up again, and may be missing. */
export type MatchedAlbum = Omit<CatalogAlbum, "coverUrl"> & { coverUrl: string | null };

export type MatchOutcome =
  | { kind: "accepted"; album: MatchedAlbum }
  | { kind: "no_match"; candidates: CatalogCandidate[] }
  | { kind: "ambiguous"; candidates: CatalogCandidate[] };

export function toCandidate(album: MatchedAlbum): CatalogCandidate {
  return {
    catalogId: album.catalogId,
    title: album.title,
    artist: album.artist,
    artistId: album.artistId,
    releaseYear: album.year,
    coverUrl: album.coverUrl,
  };
}

/** Picks the catalog album for a row from its search results, or says why none can be picked. */
export function chooseMatch(row: ImportRow, results: CatalogAlbum[]): MatchOutcome {
  const title = normalizeText(row.key.title);
  const artist = normalizeText(row.key.artist);
  const clear = results.filter(
    (album) => normalizeText(album.title) === title && normalizeText(album.artist) === artist,
  );

  if (clear.length === 1) return { kind: "accepted", album: clear[0] };
  if (clear.length === 0) {
    return { kind: "no_match", candidates: results.slice(0, NO_MATCH_CANDIDATES).map(toCandidate) };
  }
  const near = clear.filter((album) => album.year !== null && Math.abs(album.year - row.key.year) <= 1);
  if (near.length === 1) return { kind: "accepted", album: near[0] };
  return { kind: "ambiguous", candidates: clear.map(toCandidate) };
}

/** Searches the catalog with "<album> <artist>" and chooses. Rejects when the catalog can't answer. */
export async function matchRow(row: ImportRow, search: CatalogSearch): Promise<MatchOutcome> {
  return chooseMatch(row, await search(`${row.key.title} ${row.key.artist}`));
}
