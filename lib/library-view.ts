import { ERAS, decadeOf, eraLabel, eraOf, inScope, LIFETIME, scopeValue, type Scope } from "./scopes";

/** One library album with everything the library page shows or sorts by. */
export type LibraryAlbum = {
  albumId: number;
  title: string;
  artistId: number;
  artistName: string;
  coverUrl: string | null;
  /** The library year the album is grouped under. */
  year: number;
  addedAt: string;
  rating: number;
  /** Lifetime rank over the whole library: rating, highest first, a tie to the lower album id. */
  rank: number;
  played: number;
  wins: number;
  losses: number;
  ties: number;
};

export const SORT_KEYS = [
  "rating",
  "title",
  "artist",
  "year",
  "decade",
  "era",
  "played",
  "wins",
  "losses",
  "winrate",
  "added",
] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type SortDir = "asc" | "desc";
export type PlayedFilter = "all" | "played" | "unplayed";

export const SORT_LABELS: Record<SortKey, string> = {
  rating: "Rating",
  title: "Title",
  artist: "Artist",
  year: "Year",
  decade: "Decade",
  era: "Era",
  played: "Matchups played",
  wins: "Wins",
  losses: "Losses",
  winrate: "Win rate",
  added: "Date added",
};

export const DEFAULT_SORT: SortKey = "rating";
export const DEFAULT_DIRS: Record<SortKey, SortDir> = {
  rating: "desc",
  title: "asc",
  artist: "asc",
  year: "desc",
  decade: "desc",
  era: "asc",
  played: "desc",
  wins: "desc",
  losses: "desc",
  winrate: "desc",
  added: "desc",
};

export const PLAYED_FILTERS: { value: PlayedFilter; label: string }[] = [
  { value: "all", label: "All albums" },
  { value: "played", label: "Played" },
  { value: "unplayed", label: "Not played yet" },
];

export type ViewOptions = {
  sort: SortKey;
  /** Undefined means the sort key's default direction. */
  dir?: SortDir;
  q?: string;
  scope?: Scope;
  played?: PlayedFilter;
};

export type LibraryGroup = {
  /** The divider heading, e.g. "1975 · 12 albums"; null when the sort has no dividers. */
  heading: string | null;
  albums: LibraryAlbum[];
};

type Compare = (a: LibraryAlbum, b: LibraryAlbum) => number;

const text = (a: string, b: string) => a.toLowerCase().localeCompare(b.toLowerCase());
const byId: Compare = (a, b) => a.albumId - b.albumId;
const bestFirst: Compare = (a, b) => b.rating - a.rating || byId(a, b);
const eraIndex = (album: LibraryAlbum) => ERAS.findIndex((era) => era.key === eraOf(album.year));
const winRate = (album: LibraryAlbum) => (album.wins + album.ties / 2) / album.played;

type SortSpec = {
  /** The main key, ascending. The direction flips only this. */
  main: Compare;
  /** What orders albums that tie on the main key. Always ends with the album id. */
  tail: Compare;
  /** Dividers: the group an album falls in, and the heading for a group. Absent for a sort without dividers. */
  group?: { key: (album: LibraryAlbum) => string | number; heading: (album: LibraryAlbum) => string };
};

const numeric = (value: (album: LibraryAlbum) => number): Compare => (a, b) => value(a) - value(b);

const SORTS: Record<SortKey, SortSpec> = {
  rating: { main: numeric((a) => a.rating), tail: byId },
  title: { main: (a, b) => text(a.title, b.title), tail: byId },
  artist: {
    main: (a, b) => text(a.artistName, b.artistName),
    tail: (a, b) => a.artistId - b.artistId || a.year - b.year || text(a.title, b.title) || byId(a, b),
    group: { key: (a) => a.artistId, heading: (a) => a.artistName },
  },
  year: {
    main: numeric((a) => a.year),
    tail: bestFirst,
    group: { key: (a) => a.year, heading: (a) => String(a.year) },
  },
  decade: {
    main: numeric((a) => decadeOf(a.year)),
    tail: bestFirst,
    group: { key: (a) => decadeOf(a.year), heading: (a) => `${decadeOf(a.year)}s` },
  },
  era: {
    main: numeric(eraIndex),
    tail: bestFirst,
    group: { key: eraIndex, heading: (a) => eraLabel(eraOf(a.year)) },
  },
  played: { main: numeric((a) => a.played), tail: bestFirst },
  wins: { main: numeric((a) => a.wins), tail: bestFirst },
  losses: { main: numeric((a) => a.losses), tail: bestFirst },
  winrate: { main: numeric(winRate), tail: bestFirst },
  added: { main: (a, b) => (a.addedAt < b.addedAt ? -1 : a.addedAt > b.addedAt ? 1 : 0), tail: byId },
};

function matches(album: LibraryAlbum, { q, scope, played }: ViewOptions): boolean {
  if (!inScope(scope ?? LIFETIME, album.year)) return false;
  if (played === "played" && album.played === 0) return false;
  if (played === "unplayed" && album.played > 0) return false;
  const needle = q?.trim().toLowerCase();
  return !needle || album.title.toLowerCase().includes(needle) || album.artistName.toLowerCase().includes(needle);
}

/** `{n} album(s)` for a divider heading. */
function albumCount(n: number): string {
  return `${n} ${n === 1 ? "album" : "albums"}`;
}

/**
 * Filters, sorts and groups the library for the page. The direction flips the main sort key only; every order
 * ends with the album id, so it is stable. A sort with dividers returns one group per run of albums sharing the key.
 */
export function buildLibraryView(albums: LibraryAlbum[], options: ViewOptions): LibraryGroup[] {
  const spec = SORTS[options.sort];
  const sign = (options.dir ?? DEFAULT_DIRS[options.sort]) === "asc" ? 1 : -1;
  const unplayedLast = options.sort === "winrate";

  const sorted = albums.filter((album) => matches(album, options)).sort((a, b) => {
    // An album with no matchups has no win rate, so it goes last in both directions.
    if (unplayedLast && (a.played === 0 || b.played === 0)) return (a.played === 0 ? 1 : 0) - (b.played === 0 ? 1 : 0) || spec.tail(a, b);
    return sign * spec.main(a, b) || spec.tail(a, b);
  });
  if (sorted.length === 0) return [];
  if (!spec.group) return [{ heading: null, albums: sorted }];

  const { key, heading } = spec.group;
  const groups: LibraryAlbum[][] = [];
  for (const album of sorted) {
    const last = groups[groups.length - 1];
    if (last && key(last[0]) === key(album)) last.push(album);
    else groups.push([album]);
  }
  return groups.map((group) => ({ heading: `${heading(group[0])} · ${albumCount(group.length)}`, albums: group }));
}

export type ScopeChoice = { value: string; label: string };

/** The scopes the picker offers: Lifetime, the four eras, then each decade and year that has a library album, plus the current scope. */
export function scopeChoices(
  albums: Pick<LibraryAlbum, "year">[],
  current: Scope = LIFETIME,
): { eras: ScopeChoice[]; decades: ScopeChoice[]; years: ScopeChoice[] } {
  const years = new Set(albums.map((album) => album.year));
  const decades = new Set([...years].map(decadeOf));
  if (current.kind === "year") years.add(current.year);
  if (current.kind === "decade") decades.add(current.decade);
  const ascending = (values: Set<number>) => [...values].sort((a, b) => a - b);
  return {
    eras: ERAS.map((era) => ({ value: scopeValue({ kind: "era", era: era.key }), label: era.label })),
    decades: ascending(decades).map((decade) => ({ value: scopeValue({ kind: "decade", decade }), label: `${decade}s` })),
    years: ascending(years).map((year) => ({ value: scopeValue({ kind: "year", year }), label: String(year) })),
  };
}
