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
    lastMatchupAt: null,
  };
}

const scoreFor = (excess: number) => 1500 + 100 * Math.log(1 + excess / 100);

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
    { name: "lifetime", scope: LIFETIME, titles: ["Jack Johnson", "Kind of Blue", "Blue", "Tie", "Midnite Vultures", "Dog Eat Dog"] },
    { name: "an era", scope: era("60s-70s"), titles: ["Jack Johnson", "Blue"] },
    { name: "a decade", scope: { kind: "decade", decade: 1980 }, titles: ["Dog Eat Dog"] },
    { name: "a year", scope: { kind: "year", year: 1971 }, titles: ["Jack Johnson", "Blue"] },
    { name: "a scope with no albums", scope: { kind: "year", year: 1990 }, titles: [] },
  ])("ranks albums in $name, a rating tie to the artist then the title", ({ scope, titles }) => {
    const rows = buildAlbumRanking(albums, scope);
    expect(rows.map((row) => row.album.title)).toEqual(titles);
    expect(rows.map((row) => row.rank)).toEqual(titles.map((_, index) => index + 1));
  });

  it.each<{ name: string; scope: Scope; rows: [string, number, number, string][] }>([
    {
      name: "lifetime",
      scope: LIFETIME,
      // Miles has 300 points above 1500 and Joni 50; Beck and alpha have none and tie, so name order.
      rows: [
        ["Miles", scoreFor(300), 2, "Jack Johnson"],
        ["Joni", scoreFor(50), 2, "Blue"],
        ["alpha", 1500, 1, "Tie"],
        ["Beck", 1500, 1, "Midnite Vultures"],
      ],
    },
    {
      name: "an era counts only the albums in it",
      scope: era("60s-70s"),
      rows: [
        ["Miles", scoreFor(200), 1, "Jack Johnson"],
        ["Joni", scoreFor(50), 1, "Blue"],
      ],
    },
    { name: "a decade", scope: { kind: "decade", decade: 1990 }, rows: [["Beck", 1500, 1, "Midnite Vultures"]] },
    { name: "a year", scope: { kind: "year", year: 1959 }, rows: [["Miles", scoreFor(100), 1, "Kind of Blue"]] },
    { name: "a scope with no albums", scope: { kind: "year", year: 1990 }, rows: [] },
  ])("ranks artists in $name by artistScore, ties by name then id", ({ scope, rows }) => {
    const ranking = buildArtistRanking(albums, scope);
    expect(ranking.map((row) => [row.artistName, row.score, row.albumCount, row.bestAlbum.title])).toEqual(rows);
    expect(ranking.map((row) => row.rank)).toEqual(rows.map((_, index) => index + 1));
  });

  it("breaks a rating tie by artist, then title ignoring case, then album id", () => {
    const tied = [
      album(2, "Zed", 2000, 1500, "b"),
      album(1, "Abe", 2000, 1500, "z"),
      album(2, "Zed", 2000, 1500, "A"),
      album(2, "Zed", 2000, 1500, "a"),
      album(3, "Top", 2000, 1600, "Q"),
    ];
    expect(buildAlbumRanking(tied, LIFETIME).map((row) => row.album.albumId)).toEqual([tied[4], tied[1], tied[2], tied[3], tied[0]].map((a) => a.albumId));
  });

  it.each<{ name: string; scope: Scope }>([
    { name: "an era", scope: era("80s-90s") },
    { name: "a decade", scope: { kind: "decade", decade: 1980 } },
    { name: "a year", scope: { kind: "year", year: 1985 } },
  ])("ranks albums in $name in their lifetime order, so a rank agrees with its lifetime place", ({ scope }) => {
    const tied = [
      album(5, "Echo", 1985, 1500, "Same"),
      album(4, "Delta", 1985, 1500, "Same"),
      album(4, "Delta", 1985, 1500, "Also"),
      album(6, "Foxtrot", 1991, 1500, "Other"),
      album(4, "Delta", 1972, 1500, "Early"),
      album(7, "Golf", 1985, 1520, "Best"),
    ];
    const lifetime = buildAlbumRanking(tied, LIFETIME).map((row) => row.album.albumId);
    const inScoped = buildAlbumRanking(tied, scope).map((row) => row.album.albumId);
    expect(inScoped).toEqual(lifetime.filter((id) => inScoped.includes(id)));
    expect(inScoped.length).toBeGreaterThan(1);
  });

  it.each<{ name: string; artists: [string, number[]][]; order: string[] }>([
    {
      name: "six albums at 1700 above three",
      artists: [
        ["Three", [1700, 1700, 1700]],
        ["Six", Array(6).fill(1700)],
      ],
      order: ["Six", "Three"],
    },
    {
      name: "an all-unplayed artist below one with an album above 1500",
      artists: [
        ["Aardvark", [1500, 1500, 1500, 1500]],
        ["Zebra", [1510]],
      ],
      order: ["Zebra", "Aardvark"],
    },
  ])("ranks $name", ({ artists, order }) => {
    const built = artists.flatMap(([name, ratings], index) => ratings.map((rating, n) => album(100 + index, name, 2000 + n, rating)));
    expect(buildArtistRanking(built, LIFETIME).map((row) => row.artistName)).toEqual(order);
  });

  it("scores an all-unplayed artist at the base rating", () => {
    const unplayed = [album(1, "Aardvark", 2000, 1500), album(1, "Aardvark", 2001, 1500)];
    expect(buildArtistRanking(unplayed, LIFETIME)[0].score).toBe(1500);
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
        ["80s and 90s", 2, 1, 1500, "Midnite Vultures", "Beck"],
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
