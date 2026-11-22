import type { DatabaseSync } from "node:sqlite";
import { getAlbum } from "./db/albums";
import { getLibraryEntry, listLibrary } from "./db/library";
import { listMatchups, countMatchups } from "./db/matchups";
import { pickMatchup } from "./elo/pick";
import { computeRatings, type ReplayMatchup } from "./elo/replay";

export type AlbumCard = {
  id: number;
  title: string;
  artist: string;
  year: number;
  coverUrl: string | null;
};

/** Ratings are replayed from the library and the stored matchups on every call, never stored. */
export function loadRatings(db: DatabaseSync): { ratings: Map<number, number>; used: ReplayMatchup[] } {
  return computeRatings({ albumIds: listLibrary(db).map((entry) => entry.albumId), matchups: listMatchups(db) });
}

export function loadAlbumCard(db: DatabaseSync, albumId: number): AlbumCard | undefined {
  const album = getAlbum(db, albumId);
  const entry = getLibraryEntry(db, albumId);
  if (!album || !entry) return undefined;
  return { id: album.id, title: album.title, artist: album.artist.name, year: entry.year, coverUrl: album.coverUrl };
}

/** The next pair to ask about (or null when none is possible), the stored matchup total and the ratings. */
export function loadMatchupState(
  db: DatabaseSync,
  avoid: Set<string>,
  random: () => number,
): { pair: { a: AlbumCard; b: AlbumCard } | null; count: number; ratings: Map<number, number> } {
  const entries = listLibrary(db);
  const { ratings, used } = computeRatings({ albumIds: entries.map((entry) => entry.albumId), matchups: listMatchups(db) });
  const years = new Map(entries.map((entry) => [entry.albumId, entry.year]));
  const albums = [...ratings].map(([id, rating]) => ({ id, rating, year: years.get(id)! }));

  const picked = pickMatchup({ albums, matchups: used, avoid, random });
  const a = picked && loadAlbumCard(db, picked.a);
  const b = picked && loadAlbumCard(db, picked.b);
  return { pair: a && b ? { a, b } : null, count: countMatchups(db), ratings };
}
