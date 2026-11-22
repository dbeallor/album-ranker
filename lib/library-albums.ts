import type { DatabaseSync } from "node:sqlite";
import { listAlbums } from "./db/albums";
import { listLibrary } from "./db/library";
import { computeRecords } from "./elo/record";
import type { LibraryAlbum } from "./library-view";
import { loadRatings } from "./ratings";

/** Every library album with its rating, lifetime rank and record, replayed from the stored data on every call. */
export function loadLibraryAlbums(db: DatabaseSync): LibraryAlbum[] {
  const entries = new Map(listLibrary(db).map((entry) => [entry.albumId, entry]));
  const { ratings, used } = loadRatings(db);
  const records = computeRecords([...entries.keys()], used);

  const albums = listAlbums(db).flatMap((album) => {
    const entry = entries.get(album.id);
    const rating = ratings.get(album.id);
    const record = records.get(album.id);
    if (!entry || rating === undefined || !record) return [];
    return [
      {
        albumId: album.id,
        title: album.title,
        artistId: album.artist.id,
        artistName: album.artist.name,
        coverUrl: album.coverUrl,
        year: entry.year,
        addedAt: entry.addedAt,
        rating,
        rank: 0,
        played: record.played,
        wins: record.wins,
        losses: record.losses,
        ties: record.ties,
      },
    ];
  });

  [...albums]
    .sort((a, b) => b.rating - a.rating || a.albumId - b.albumId)
    .forEach((album, index) => {
      album.rank = index + 1;
    });
  return albums;
}
