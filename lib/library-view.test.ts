import { describe, expect, it } from "vitest";
import {
  buildLibraryView,
  DEFAULT_DIRS,
  scopeChoices,
  SORT_KEYS,
  type LibraryAlbum,
  type LibraryGroup,
  type SortDir,
  type SortKey,
} from "./library-view";
import { parseScope } from "./scopes";

function album(
  albumId: number,
  title: string,
  artistId: number,
  year: number,
  rating: number,
  [wins, losses, ties]: [number, number, number],
  addedAt: string,
): LibraryAlbum {
  return {
    albumId,
    title,
    artistId,
    artistName: `Artist ${artistId}`,
    coverUrl: null,
    year,
    addedAt,
    rating,
    rank: 0,
    played: wins + losses + ties,
    wins,
    losses,
    ties,
  };
}

const LIBRARY: LibraryAlbum[] = [
  album(1, "Beta", 2, 1975, 1520, [2, 0, 0], "2025-03-01"),
  album(2, "alpha", 1, 1975, 1480, [0, 2, 0], "2025-01-01"),
  album(3, "Gamma", 1, 1972, 1500, [0, 0, 0], "2025-02-01"),
  album(4, "Delta", 3, 1985, 1510, [1, 1, 0], "2025-04-01"),
  album(5, "Epsilon", 3, 1985, 1510, [0, 0, 2], "2025-04-01"),
  album(6, "Zeta", 2, 2003, 1530, [3, 1, 0], "2025-05-01"),
  album(7, "Eta", 4, 1955, 1500, [0, 0, 0], "2025-06-01"),
  album(8, "Theta", 4, 2021, 1490, [1, 2, 1], "2025-02-01"),
];

const ids = (groups: LibraryGroup[]) => groups.map((group) => group.albums.map((a) => a.albumId));
const headings = (groups: LibraryGroup[]) => groups.map((group) => group.heading);
const flat = (groups: LibraryGroup[]) => ids(groups).flat();

const YEARS = {
  desc: [[8], [6], [4, 5], [1, 2], [3], [7]],
  asc: [[7], [3], [1, 2], [4, 5], [6], [8]],
};

type Case = { sort: SortKey; dir: SortDir; ids: number[][]; headings: (string | null)[] };

const SORT_CASES: Case[] = [
  { sort: "rating", dir: "desc", ids: [[6, 1, 4, 5, 3, 7, 8, 2]], headings: [null] },
  { sort: "rating", dir: "asc", ids: [[2, 8, 3, 7, 4, 5, 1, 6]], headings: [null] },
  { sort: "title", dir: "asc", ids: [[2, 1, 4, 5, 7, 3, 8, 6]], headings: [null] },
  { sort: "title", dir: "desc", ids: [[6, 8, 3, 7, 5, 4, 1, 2]], headings: [null] },
  {
    sort: "artist",
    dir: "asc",
    ids: [[3, 2], [1, 6], [4, 5], [7, 8]],
    headings: ["Artist 1 · 2 albums", "Artist 2 · 2 albums", "Artist 3 · 2 albums", "Artist 4 · 2 albums"],
  },
  {
    sort: "artist",
    dir: "desc",
    ids: [[7, 8], [4, 5], [1, 6], [3, 2]],
    headings: ["Artist 4 · 2 albums", "Artist 3 · 2 albums", "Artist 2 · 2 albums", "Artist 1 · 2 albums"],
  },
  {
    sort: "year",
    dir: "desc",
    ids: YEARS.desc,
    headings: ["2021 · 1 album", "2003 · 1 album", "1985 · 2 albums", "1975 · 2 albums", "1972 · 1 album", "1955 · 1 album"],
  },
  {
    sort: "year",
    dir: "asc",
    ids: YEARS.asc,
    headings: ["1955 · 1 album", "1972 · 1 album", "1975 · 2 albums", "1985 · 2 albums", "2003 · 1 album", "2021 · 1 album"],
  },
  {
    sort: "decade",
    dir: "desc",
    ids: [[8], [6], [4, 5], [1, 3, 2], [7]],
    headings: ["2020s · 1 album", "2000s · 1 album", "1980s · 2 albums", "1970s · 3 albums", "1950s · 1 album"],
  },
  {
    sort: "decade",
    dir: "asc",
    ids: [[7], [1, 3, 2], [4, 5], [6], [8]],
    headings: ["1950s · 1 album", "1970s · 3 albums", "1980s · 2 albums", "2000s · 1 album", "2020s · 1 album"],
  },
  {
    sort: "era",
    dir: "asc",
    ids: [[7], [1, 3, 2], [4, 5], [6, 8]],
    headings: ["Pre-60s · 1 album", "60s and 70s · 3 albums", "80s and 90s · 2 albums", "00s and after · 2 albums"],
  },
  {
    sort: "era",
    dir: "desc",
    ids: [[6, 8], [4, 5], [1, 3, 2], [7]],
    headings: ["00s and after · 2 albums", "80s and 90s · 2 albums", "60s and 70s · 3 albums", "Pre-60s · 1 album"],
  },
  { sort: "played", dir: "desc", ids: [[6, 8, 1, 4, 5, 2, 3, 7]], headings: [null] },
  { sort: "played", dir: "asc", ids: [[3, 7, 1, 4, 5, 2, 6, 8]], headings: [null] },
  { sort: "wins", dir: "desc", ids: [[6, 1, 4, 8, 5, 3, 7, 2]], headings: [null] },
  { sort: "wins", dir: "asc", ids: [[5, 3, 7, 2, 4, 8, 1, 6]], headings: [null] },
  { sort: "losses", dir: "desc", ids: [[8, 2, 6, 4, 1, 5, 3, 7]], headings: [null] },
  { sort: "losses", dir: "asc", ids: [[1, 5, 3, 7, 6, 4, 8, 2]], headings: [null] },
  // Win rate, a tie as half a win: Beta 1, Zeta .75, Delta .5, Epsilon .5, Theta .375, alpha 0. Unplayed 3 and 7 go last either way.
  { sort: "winrate", dir: "desc", ids: [[1, 6, 4, 5, 8, 2, 3, 7]], headings: [null] },
  { sort: "winrate", dir: "asc", ids: [[2, 8, 4, 5, 6, 1, 3, 7]], headings: [null] },
  { sort: "added", dir: "desc", ids: [[7, 6, 4, 5, 1, 3, 8, 2]], headings: [null] },
  { sort: "added", dir: "asc", ids: [[2, 3, 8, 1, 4, 5, 6, 7]], headings: [null] },
];

describe("buildLibraryView sorting", () => {
  it("has a case for every sort key in both directions", () => {
    expect(SORT_CASES.map((c) => `${c.sort} ${c.dir}`).sort()).toEqual(
      SORT_KEYS.flatMap((key) => [`${key} asc`, `${key} desc`]).sort(),
    );
  });

  it.each(SORT_CASES.map((c) => [`${c.sort} ${c.dir}`, c] as const))("%s", (_name, c) => {
    const groups = buildLibraryView(LIBRARY, { sort: c.sort, dir: c.dir });
    expect(ids(groups)).toEqual(c.ids);
    expect(headings(groups)).toEqual(c.headings);
  });

  it.each(SORT_KEYS)("%s uses its default direction when none is given", (sort) => {
    expect(ids(buildLibraryView(LIBRARY, { sort }))).toEqual(ids(buildLibraryView(LIBRARY, { sort, dir: DEFAULT_DIRS[sort] })));
  });
});

describe("buildLibraryView filters", () => {
  it.each([
    { name: "title, case-insensitive", options: { q: "ALPHA" }, expected: [2] },
    { name: "artist name", options: { q: "artist 4" }, expected: [7, 8] },
    { name: "title contains", options: { q: "eta" }, expected: [6, 1, 7, 8] },
    { name: "blank query keeps all", options: { q: "  " }, expected: [6, 1, 4, 5, 3, 7, 8, 2] },
    { name: "era scope", options: { scope: parseScope("era-60s-70s")! }, expected: [1, 3, 2] },
    { name: "decade scope", options: { scope: parseScope("decade-1980")! }, expected: [4, 5] },
    { name: "year scope", options: { scope: parseScope("year-2021")! }, expected: [8] },
    { name: "played only", options: { played: "played" as const }, expected: [6, 1, 4, 5, 8, 2] },
    { name: "unplayed only", options: { played: "unplayed" as const }, expected: [3, 7] },
    { name: "filters combine", options: { q: "eta", played: "played" as const, scope: parseScope("era-00s-on")! }, expected: [6, 8] },
    { name: "nothing matches", options: { q: "nope" }, expected: [] },
  ])("$name", ({ options, expected }) => {
    expect(flat(buildLibraryView(LIBRARY, { sort: "rating", ...options }))).toEqual(expected);
  });

  it("counts a divider's albums after filtering, and returns no groups when nothing matches", () => {
    expect(headings(buildLibraryView(LIBRARY, { sort: "year", played: "played" }))).toEqual([
      "2021 · 1 album",
      "2003 · 1 album",
      "1985 · 2 albums",
      "1975 · 2 albums",
    ]);
    expect(buildLibraryView(LIBRARY, { sort: "year", q: "nope" })).toEqual([]);
  });
});

describe("scopeChoices", () => {
  it("lists only decades and years that have an album, plus the current scope", () => {
    const choices = scopeChoices(LIBRARY, parseScope("year-1990")!);
    expect(choices.eras).toHaveLength(4);
    expect(choices.decades.map((c) => c.value)).toEqual(["decade-1950", "decade-1970", "decade-1980", "decade-2000", "decade-2020"]);
    expect(choices.years.map((c) => c.label)).toEqual(["1955", "1972", "1975", "1985", "1990", "2003", "2021"]);
  });
});
