import type { DatabaseSync } from "node:sqlite";
import { artistScore } from "./elo/artist-score";
import { computeProgress, type RankingProgress } from "./elo/progress";
import type { ReplayMatchup } from "./elo/replay";
import { bestFirst, type LibraryAlbum } from "./library-view";
import { loadLibrary } from "./library-albums";
import { ERAS, decadeOf, inScope, scopeLabel, type Scope } from "./scopes";

export type AlbumRankRow = {
  /** 1 to n within the scope, in `bestFirst` order. */
  rank: number;
  album: LibraryAlbum;
};

export type ArtistRankRow = {
  rank: number;
  artistId: number;
  artistName: string;
  /** Unrounded; the page rounds it. */
  score: number;
  albumCount: number;
  bestAlbum: { albumId: number; title: string; rating: number };
};

export type PeriodKind = "years" | "decades" | "eras";

export type PeriodRow = {
  /** The period as a scope, so the page can link to its album ranking. */
  scope: Scope;
  label: string;
  albumCount: number;
  /** Counted matchups with at least one album from the period, each counted once. */
  matchups: number;
  /** Unrounded. */
  averageRating: number;
  topAlbum: { albumId: number; title: string; rating: number };
  topArtist: { artistId: number; name: string };
};

/** Every album in the scope by rating, highest first. */
export function buildAlbumRanking(albums: LibraryAlbum[], scope: Scope): AlbumRankRow[] {
  return albums
    .filter((album) => inScope(scope, album.year))
    .sort(bestFirst)
    .map((album, index) => ({ rank: index + 1, album }));
}

/** One row per artist with an album in the scope, best `artistScore` first; a tie goes to the name (case-insensitive), then the id. */
export function buildArtistRanking(albums: LibraryAlbum[], scope: Scope): ArtistRankRow[] {
  const byArtist = new Map<number, { name: string; albums: LibraryAlbum[] }>();
  for (const album of albums) {
    if (!inScope(scope, album.year)) continue;
    const group = byArtist.get(album.artistId) ?? { name: album.artistName, albums: [] };
    group.albums.push(album);
    byArtist.set(album.artistId, group);
  }

  return [...byArtist]
    .map(([artistId, { name, albums: owned }]) => {
      const best = [...owned].sort(bestFirst)[0];
      return {
        artistId,
        artistName: name,
        score: artistScore(owned.map((album) => album.rating))!,
        albumCount: owned.length,
        bestAlbum: { albumId: best.albumId, title: best.title, rating: best.rating },
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.artistName.toLowerCase().localeCompare(b.artistName.toLowerCase()) ||
        a.artistId - b.artistId,
    )
    .map((row, index) => ({ rank: index + 1, ...row }));
}

function periodScopes(albums: LibraryAlbum[], kind: PeriodKind): Scope[] {
  const years = [...new Set(albums.map((album) => album.year))].sort((a, b) => a - b);
  switch (kind) {
    case "years":
      return years.map((year) => ({ kind: "year", year }));
    case "decades":
      return [...new Set(years.map(decadeOf))].map((decade) => ({ kind: "decade", decade }));
    case "eras":
      return ERAS.map((era): Scope => ({ kind: "era", era: era.key })).filter((scope) =>
        albums.some((album) => inScope(scope, album.year)),
      );
  }
}

/** One row per year, decade or era that has albums, in time order. */
export function buildPeriodSummary(
  albums: LibraryAlbum[],
  used: Pick<ReplayMatchup, "albumAId" | "albumBId">[],
  kind: PeriodKind,
): PeriodRow[] {
  const yearOf = new Map(albums.map((album) => [album.albumId, album.year]));
  return periodScopes(albums, kind).map((scope) => {
    const inPeriod = albums.filter((album) => inScope(scope, album.year));
    const top = [...inPeriod].sort(bestFirst)[0];
    const topArtist = buildArtistRanking(albums, scope)[0];
    const matchups = used.filter((matchup) => {
      const a = yearOf.get(matchup.albumAId);
      const b = yearOf.get(matchup.albumBId);
      return (a !== undefined && inScope(scope, a)) || (b !== undefined && inScope(scope, b));
    }).length;
    return {
      scope,
      label: scopeLabel(scope),
      albumCount: inPeriod.length,
      matchups,
      averageRating: inPeriod.reduce((sum, album) => sum + album.rating, 0) / inPeriod.length,
      topAlbum: { albumId: top.albumId, title: top.title, rating: top.rating },
      topArtist: { artistId: topArtist.artistId, name: topArtist.artistName },
    };
  });
}

export type AnalyticsView = "albums" | "artists" | PeriodKind;

export const ANALYTICS_VIEWS: { value: AnalyticsView; label: string }[] = [
  { value: "albums", label: "Albums" },
  { value: "artists", label: "Artists" },
  { value: "years", label: "Years" },
  { value: "decades", label: "Decades" },
  { value: "eras", label: "Eras" },
];

export type AnalyticsData =
  | { view: "albums"; rows: AlbumRankRow[] }
  | { view: "artists"; rows: ArtistRankRow[] }
  | { view: PeriodKind; rows: PeriodRow[] };

/** The rows for one view, replayed from the stored data on every call. The scope matters only to albums and artists. */
export function loadAnalytics(
  db: DatabaseSync,
  view: AnalyticsView,
  scope: Scope,
): { data: AnalyticsData; libraryAlbums: LibraryAlbum[]; progress: RankingProgress | null } {
  const { albums, used } = loadLibrary(db);
  const data: AnalyticsData =
    view === "albums"
      ? { view, rows: buildAlbumRanking(albums, scope) }
      : view === "artists"
        ? { view, rows: buildArtistRanking(albums, scope) }
        : { view, rows: buildPeriodSummary(albums, used, view) };
  const progress = computeProgress(new Map(albums.map((album) => [album.albumId, album.rating])), used);
  return { data, libraryAlbums: albums, progress };
}
