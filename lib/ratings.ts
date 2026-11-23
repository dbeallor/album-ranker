import type { DatabaseSync } from "node:sqlite";
import { getAlbum } from "./db/albums";
import { getLibraryEntry, listLibrary } from "./db/library";
import { listMatchups, countMatchups } from "./db/matchups";
import { pickMatchup } from "./elo/pick";
import { computeProgress, type RankingProgress } from "./elo/progress";
import { computeRatings, type ReplayMatchup } from "./elo/replay";

export type AlbumCard = {
  id: number;
  title: string;
  artist: string;
  year: number;
  coverUrl: string | null;
};

/**
 * Ratings are replayed from the library and the stored matchups on every call, never stored.
 * `extra` matchups are replayed after the stored ones without being stored, to see what an answer would do.
 */
export function loadRatings(
  db: DatabaseSync,
  extra: ReplayMatchup[] = [],
): { ratings: Map<number, number>; used: ReplayMatchup[] } {
  return computeRatings({ albumIds: listLibrary(db).map((entry) => entry.albumId), matchups: [...listMatchups(db), ...extra] });
}

/** The ranking progress for a replay result, as `loadRatings` returns it. */
export function progressOf({ ratings, used }: { ratings: Map<number, number>; used: ReplayMatchup[] }): RankingProgress | null {
  return computeProgress(ratings, used);
}

export function loadAlbumCard(db: DatabaseSync, albumId: number): AlbumCard | undefined {
  const album = getAlbum(db, albumId);
  const entry = getLibraryEntry(db, albumId);
  if (!album || !entry) return undefined;
  return { id: album.id, title: album.title, artist: album.artist.name, year: entry.year, coverUrl: album.coverUrl };
}

/** The next pair to ask about (or null when none is possible), the stored matchup total, the ratings and the ranking progress. */
export function loadMatchupState(
  db: DatabaseSync,
  avoid: Set<string>,
  random: () => number,
): {
  pair: { a: AlbumCard; b: AlbumCard } | null;
  count: number;
  ratings: Map<number, number>;
  progress: RankingProgress | null;
} {
  const entries = listLibrary(db);
  const { ratings, used } = computeRatings({ albumIds: entries.map((entry) => entry.albumId), matchups: listMatchups(db) });
  const albums = [...ratings].map(([id, rating]) => ({ id, rating }));

  const picked = pickMatchup({ albums, matchups: used, avoid, random });
  const a = picked && loadAlbumCard(db, picked.a);
  const b = picked && loadAlbumCard(db, picked.b);
  return { pair: a && b ? { a, b } : null, count: countMatchups(db), ratings, progress: progressOf({ ratings, used }) };
}
