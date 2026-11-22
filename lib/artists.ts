import type { DatabaseSync } from "node:sqlite";
import { listAlbums } from "./db/albums";
import { listLibrary } from "./db/library";
import { artistScore } from "./elo/artist-score";
import { loadRatings } from "./ratings";
import { decadeOf } from "./scopes";

export type RatedAlbum = {
  albumId: number;
  artistId: number;
  artistName: string;
  /** The year the album is grouped under in the library (not the catalog release year). */
  year: number;
  rating: number;
};

export type ArtistRow = {
  rank: number;
  artistId: number;
  artistName: string;
  /** Unrounded; the pages round it for display. */
  score: number;
  ratedAlbumCount: number;
};

/**
 * One row per artist with a rated album in scope (all albums, or those in the library under `decade`), best score first.
 * A score tie goes to the artist name (case-insensitive), then the artist id. Ranks run 1 to n with no shared ranks.
 */
export function buildArtistList(albums: RatedAlbum[], decade?: number): ArtistRow[] {
  const inScope = decade === undefined ? albums : albums.filter((album) => decadeOf(album.year) === decade);

  const byArtist = new Map<number, { name: string; ratings: number[] }>();
  for (const album of inScope) {
    const group = byArtist.get(album.artistId) ?? { name: album.artistName, ratings: [] };
    group.ratings.push(album.rating);
    byArtist.set(album.artistId, group);
  }

  return [...byArtist]
    .map(([artistId, { name, ratings }]) => ({
      artistId,
      artistName: name,
      score: artistScore(ratings)!,
      ratedAlbumCount: ratings.length,
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.artistName.toLowerCase().localeCompare(b.artistName.toLowerCase()) ||
        a.artistId - b.artistId,
    )
    .map((row, index) => ({ rank: index + 1, ...row }));
}

/** The artists' list, replayed from the stored data on every call. */
export function loadArtistList(db: DatabaseSync, decade?: number): ArtistRow[] {
  return buildArtistList(loadRatedAlbums(db), decade);
}

function loadRatedAlbums(db: DatabaseSync): RatedAlbum[] {
  const { ratings } = loadRatings(db);
  const years = new Map(listLibrary(db).map((entry) => [entry.albumId, entry.year]));
  return listAlbums(db).flatMap((album) => {
    const rating = ratings.get(album.id);
    const year = years.get(album.id);
    if (rating === undefined || year === undefined) return [];
    return [{ albumId: album.id, artistId: album.artist.id, artistName: album.artist.name, year, rating }];
  });
}

export type ArtistPageAlbum = {
  albumId: number;
  title: string;
  coverUrl: string | null;
  year: number;
  rating: number;
};

export type ArtistPage = {
  id: number;
  name: string;
  /** Null when the artist has no library albums. */
  score: number | null;
  ratedAlbumCount: number;
  albums: ArtistPageAlbum[];
};

/** The artist with their library albums by year then album id; undefined if unknown. */
export function loadArtistPage(db: DatabaseSync, artistId: number): ArtistPage | undefined {
  const owned = listAlbums(db).filter((album) => album.artist.id === artistId);
  if (owned.length === 0) return undefined;

  const { ratings } = loadRatings(db);
  const entries = new Map(listLibrary(db).map((entry) => [entry.albumId, entry]));

  const albums = owned
    .flatMap((album) => {
      const entry = entries.get(album.id);
      const rating = ratings.get(album.id);
      if (!entry || rating === undefined) return [];
      return [
        {
          albumId: album.id,
          title: album.title,
          coverUrl: album.coverUrl,
          year: entry.year,
          rating,
        },
      ];
    })
    .sort((a, b) => a.year - b.year || a.albumId - b.albumId);

  return {
    id: artistId,
    name: owned[0].artist.name,
    score: artistScore(albums.map((album) => album.rating)) ?? null,
    ratedAlbumCount: albums.length,
    albums,
  };
}
