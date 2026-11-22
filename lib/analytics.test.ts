import { describe, expect, it } from "vitest";
import { buildAlbumRanking, buildArtistRanking, buildPeriodSummary, loadAnalytics } from "./analytics";
import { createAlbum } from "./db/albums";
import { addToLibrary } from "./db/library";
import { recordMatchup } from "./db/matchups";
import { memoryDb } from "./db/test-db";
import type { LibraryAlbum } from "./library-view";
import { LIFETIME, type Scope } from "./scopes";

let nextId = 1;
function album(artistId: number, artistName: string, year: number, rating: number, title = `T${nextId}`): LibraryAlbum {
  return {
    albumId: nextId++,
    title,
    artistId,
    artistName,
    coverUrl: null,
    year,
    addedAt: "2025-01-01T00:00:00.000Z",
    rating,
    rank: 0,
    played: 0,
    wins: 0,
    losses: 0,
    ties: 0,
  };
}

const era = (key: "pre-60s" | "60s-70s" | "80s-90s" | "00s-on"): Scope => ({ kind: "era", era: key });

describe("analytics rankings and summaries", () => {
  const albums = [
    album(1, "Miles", 1959, 1600, "Kind of Blue"),
    album(1, "Miles", 1971, 1700, "Jack Johnson"),
    album(2, "Joni", 1971, 1550, "Blue"),
    album(2, "Joni", 1985, 1500, "Dog Eat Dog"),
    album(3, "Beck", 1999, 1500, "Midnite Vultures"),
    album(4, "alpha", 2005, 1500, "Tie"),
  ];
  const [kindOfBlue, jackJohnson, blue, dogEatDog, midnite] = albums;
  // Matchups: one inside 1971, one across 1959 and 1971, one across 1985 and 1999, one with an album outside the library.
  const used = [
    { albumAId: jackJohnson.albumId, albumBId: blue.albumId },
    { albumAId: kindOfBlue.albumId, albumBId: jackJohnson.albumId },
    { albumAId: dogEatDog.albumId, albumBId: midnite.albumId },
  ];

  it.each<{ name: string; scope: Scope; titles: string[] }>([
    { name: "lifetime", scope: LIFETIME, titles: ["Jack Johnson", "Kind of Blue", "Blue", "Dog Eat Dog", "Midnite Vultures", "Tie"] },
    { name: "an era", scope: era("60s-70s"), titles: ["Jack Johnson", "Blue"] },
    { name: "a decade", scope: { kind: "decade", decade: 1980 }, titles: ["Dog Eat Dog"] },
    { name: "a year", scope: { kind: "year", year: 1971 }, titles: ["Jack Johnson", "Blue"] },
    { name: "a scope with no albums", scope: { kind: "year", year: 1990 }, titles: [] },
  ])("ranks albums in $name, a rating tie to the lower album id", ({ scope, titles }) => {
    const rows = buildAlbumRanking(albums, scope);
    expect(rows.map((row) => row.album.title)).toEqual(titles);
    expect(rows.map((row) => row.rank)).toEqual(titles.map((_, index) => index + 1));
  });

  it.each<{ name: string; scope: Scope; rows: [string, number, number, string][] }>([
    {
      name: "lifetime",
      scope: LIFETIME,
      // Miles (1600 + 1700 + 1500) / 3 = 1600; Joni (1550 + 1500 + 1500) / 3 = 1516.67; Beck and alpha 1500 tie, so name order.
      rows: [
        ["Miles", 1600, 2, "Jack Johnson"],
        ["Joni", 4550 / 3, 2, "Blue"],
        ["alpha", 1500, 1, "Tie"],
        ["Beck", 1500, 1, "Midnite Vultures"],
      ],
    },
    {
      name: "an era counts only the albums in it",
      scope: era("60s-70s"),
      rows: [
        ["Miles", 1600, 1, "Jack Johnson"],
        ["Joni", 1525, 1, "Blue"],
      ],
    },
    { name: "a decade", scope: { kind: "decade", decade: 1990 }, rows: [["Beck", 1500, 1, "Midnite Vultures"]] },
    { name: "a year", scope: { kind: "year", year: 1959 }, rows: [["Miles", 1550, 1, "Kind of Blue"]] },
    { name: "a scope with no albums", scope: { kind: "year", year: 1990 }, rows: [] },
  ])("ranks artists in $name by artistScore, ties by name then id", ({ scope, rows }) => {
    const ranking = buildArtistRanking(albums, scope);
    expect(ranking.map((row) => [row.artistName, row.score, row.albumCount, row.bestAlbum.title])).toEqual(rows);
    expect(ranking.map((row) => row.rank)).toEqual(rows.map((_, index) => index + 1));
  });

  it("breaks an artist tie on the same name by artist id", () => {
    const tied = [album(9, "Same", 2000, 1500), album(8, "Same", 2001, 1500)];
    expect(buildArtistRanking(tied, LIFETIME).map((row) => row.artistId)).toEqual([8, 9]);
  });

  it.each<{ name: string; kind: "years" | "decades" | "eras"; rows: [string, number, number, number, string, string][] }>([
    {
      name: "years: only years with albums, in time order",
      kind: "years",
      rows: [
        ["1959", 1, 1, 1600, "Kind of Blue", "Miles"],
        ["1971", 2, 2, 1625, "Jack Johnson", "Miles"],
        ["1985", 1, 1, 1500, "Dog Eat Dog", "Joni"],
        ["1999", 1, 1, 1500, "Midnite Vultures", "Beck"],
        ["2005", 1, 0, 1500, "Tie", "alpha"],
      ],
    },
    {
      name: "decades",
      kind: "decades",
      rows: [
        ["1950s", 1, 1, 1600, "Kind of Blue", "Miles"],
        ["1970s", 2, 2, 1625, "Jack Johnson", "Miles"],
        ["1980s", 1, 1, 1500, "Dog Eat Dog", "Joni"],
        ["1990s", 1, 1, 1500, "Midnite Vultures", "Beck"],
        ["2000s", 1, 0, 1500, "Tie", "alpha"],
      ],
    },
    {
      name: "eras: a matchup across two eras counts once in each",
      kind: "eras",
      rows: [
        ["Pre-60s", 1, 1, 1600, "Kind of Blue", "Miles"],
        ["60s and 70s", 2, 2, 1625, "Jack Johnson", "Miles"],
        ["80s and 90s", 2, 1, 1500, "Dog Eat Dog", "Beck"],
        ["00s and after", 1, 0, 1500, "Tie", "alpha"],
      ],
    },
  ])("summarizes $name", ({ kind, rows }) => {
    const summary = buildPeriodSummary(albums, used, kind);
    expect(summary.map((row) => [row.label, row.albumCount, row.matchups, row.averageRating, row.topAlbum.title, row.topArtist.name])).toEqual(rows);
  });

  it("counts a matchup inside one period once, not twice", () => {
    const [row] = buildPeriodSummary(albums, [used[0]], "decades").filter((r) => r.label === "1970s");
    expect(row.matchups).toBe(1);
  });

  it("an empty library has no periods", () => {
    expect(buildPeriodSummary([], [], "eras")).toEqual([]);
  });
});

describe("loadAnalytics", () => {
  it("replays matchups from the database into each view", () => {
    const db = memoryDb();
    const add = (title: string, artist: string, year: number) => {
      const created = createAlbum(db, { title, artist: { name: artist } });
      addToLibrary(db, { albumId: created.id, year });
      return created.id;
    };
    const one = add("One", "Aardvark", 1975);
    const two = add("Two", "Bear", 1985);
    add("Three", "Bear", 1985);
    recordMatchup(db, { albumAId: one, albumBId: two, result: "a", createdAt: "2025-01-01T00:00:00.000Z" });

    const albumsView = loadAnalytics(db, "albums", LIFETIME);
    expect(albumsView.data.view).toBe("albums");
    expect(albumsView.data.rows.map((row) => ("album" in row ? [row.album.title, row.album.played] : []))).toEqual([
      ["One", 1],
      ["Three", 0],
      ["Two", 1],
    ]);
    expect(albumsView.libraryAlbums).toHaveLength(3);

    const artists = loadAnalytics(db, "artists", { kind: "decade", decade: 1980 }).data;
    expect(artists.rows.map((row) => ("artistName" in row ? row.artistName : ""))).toEqual(["Bear"]);

    const years = loadAnalytics(db, "years", LIFETIME).data;
    expect(years.rows.map((row) => ("matchups" in row ? [row.label, row.matchups] : []))).toEqual([
      ["1975", 1],
      ["1985", 1],
    ]);
  });
});
