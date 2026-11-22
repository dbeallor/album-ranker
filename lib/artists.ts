import type { DatabaseSync } from "node:sqlite";
import { listAlbums } from "./db/albums";
import { artistScore } from "./elo/artist-score";
import { loadLibraryAlbums } from "./library-albums";

export type ArtistPageAlbum = {
  albumId: number;
  title: string;
  coverUrl: string | null;
  year: number;
  rating: number;
  wins: number;
  losses: number;
  ties: number;
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

  const albums = loadLibraryAlbums(db)
    .filter((album) => album.artistId === artistId)
    .map(({ albumId, title, coverUrl, year, rating, wins, losses, ties }) => ({ albumId, title, coverUrl, year, rating, wins, losses, ties }))
    .sort((a, b) => a.year - b.year || a.albumId - b.albumId);

  return {
    id: artistId,
    name: owned[0].artist.name,
    score: artistScore(albums.map((album) => album.rating)) ?? null,
    ratedAlbumCount: albums.length,
    albums,
  };
}
