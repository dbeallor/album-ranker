import { describe, expect, it } from "vitest";
import { buildArtistList, loadArtistList, loadArtistPage, type RatedAlbum } from "./artists";
import { createAlbum } from "./db/albums";
import { memoryDb } from "./db/test-db";
import { addYearEntry } from "./db/year-entries";
import { answerMatchup } from "./matchups-service";

let nextAlbum = 1;
function album(artistId: number, artistName: string, year: number, rating: number): RatedAlbum {
  return { albumId: nextAlbum++, artistId, artistName, year, rating };
}

describe("buildArtistList", () => {
  const albums = [
    album(1, "Miles", 1962, 1600),
    album(1, "Miles", 1971, 1700),
    album(1, "Miles", 1985, 1500),
    album(2, "Joni", 1971, 1550),
  ];

  it.each([
    {
      name: "overall counts all of an artist's albums",
      decade: undefined,
      // Miles: (1600 + 1700 + 1500 + 1500) / 4 = 1575; Joni: (1550 + 1500) / 2 = 1525
      rows: [
        { artistName: "Miles", score: 1575, ratedAlbumCount: 3 },
        { artistName: "Joni", score: 1525, ratedAlbumCount: 1 },
      ],
    },
    {
      name: "the 1960s hold only that decade's albums",
      decade: 1960,
      rows: [{ artistName: "Miles", score: 1550, ratedAlbumCount: 1 }],
    },
    {
      name: "the 1970s hold only that decade's albums",
      decade: 1970,
      rows: [
        { artistName: "Miles", score: 1600, ratedAlbumCount: 1 },
        { artistName: "Joni", score: 1525, ratedAlbumCount: 1 },
      ],
    },
    {
      name: "the 1980s hold only that decade's albums",
      decade: 1980,
      rows: [{ artistName: "Miles", score: 1500, ratedAlbumCount: 1 }],
    },
    { name: "a decade with no rated albums is empty", decade: 1950, rows: [] },
  ])("$name", ({ decade, rows }) => {
    expect(buildArtistList(albums, decade).map((r) => ({
        artistName: r.artistName,
        score: r.score,
        ratedAlbumCount: r.ratedAlbumCount,
      }))).toEqual(rows);
  });

  it("scores albums rated 1600 and 1700 as 1600", () => {
    const [row] = buildArtistList([album(1, "A", 1990, 1600), album(1, "A", 1991, 1700)]);
    expect(row.score).toBe(1600);
  });

  it("ranks run 1 to n and tied scores get separate ranks ordered by name, then id", () => {
    const tied = [
      album(3, "beta", 2000, 1600),
      album(2, "Alpha", 2000, 1600),
      album(5, "Same", 2000, 1600),
      album(4, "Same", 2001, 1600),
      album(6, "Top", 2000, 1900),
    ];
    const rows = buildArtistList(tied);
    expect(rows.map((r) => [r.rank, r.artistId])).toEqual([
      [1, 6],
      [2, 2],
      [3, 3],
      [4, 4],
      [5, 5],
    ]);
  });

  it("leaves the score unrounded", () => {
    const [row] = buildArtistList([album(1, "A", 2000, 1501)]);
    expect(row.score).toBe(1500.5);
  });
});

describe("loaders against a database", () => {
  function seed() {
    const db = memoryDb();
    const a1 = createAlbum(db, { title: "A One", artist: { name: "Aardvark" }, coverUrl: "https://example.test/a.jpg" }).id;
    const b1 = createAlbum(db, { title: "B One", artist: { name: "Bear" } }).id;
    const a2 = createAlbum(db, { title: "A Two", artist: { name: "Aardvark" } }).id;
    const a3 = createAlbum(db, { title: "A Unplaced", artist: { name: "Aardvark" } }).id;
    const c1 = createAlbum(db, { title: "C Listed", artist: { name: "Cat" } }).id;
    addYearEntry(db, { albumId: a1, year: 1971, placement: "ranked", rank: 1 });
    addYearEntry(db, { albumId: b1, year: 1972, placement: "ranked", rank: 1 });
    addYearEntry(db, { albumId: a2, year: 1969, placement: "honorable_mention" });
    addYearEntry(db, { albumId: c1, year: 1971, placement: "listed" });
    return { db, a1, b1, a2, a3, c1 };
  }

  it("a matchup swaps the order overall and in the decade both albums sit in", () => {
    const { db, a1, b1 } = seed();
    expect(loadArtistList(db).map((r) => r.artistName)).toEqual(["Aardvark", "Bear"]);
    expect(loadArtistList(db, 1970).map((r) => r.artistName)).toEqual(["Aardvark", "Bear"]);

    const result = answerMatchup(db, a1, b1, "b", [], () => 0);
    expect("error" in result).toBe(false);

    expect(loadArtistList(db).map((r) => r.artistName)).toEqual(["Bear", "Aardvark"]);
    expect(loadArtistList(db, 1970).map((r) => r.artistName)).toEqual(["Bear", "Aardvark"]);
  });

  it("leaves out listed and unplaced albums", () => {
    const { db } = seed();
    expect(loadArtistList(db).map((r) => r.artistName)).not.toContain("Cat");
    expect(loadArtistList(db)[0].ratedAlbumCount).toBe(2);
  });

  it("loads an artist page with placed albums by year, listed ones without a rating", () => {
    const { db, a1, a2, c1 } = seed();
    const aardvarkId = loadArtistList(db).find((r) => r.artistName === "Aardvark")!.artistId;
    const page = loadArtistPage(db, aardvarkId)!;

    expect(page.name).toBe("Aardvark");
    expect(page.ratedAlbumCount).toBe(2);
    expect(page.albums.map((x) => [x.albumId, x.year, x.placement, x.rank, x.coverUrl === null])).toEqual([
      [a2, 1969, "honorable_mention", null, true],
      [a1, 1971, "ranked", 1, false],
    ]);

    const cat = loadArtistPage(db, db.prepare("SELECT id FROM artists WHERE name = 'Cat'").get()!.id as number)!;
    expect(cat.albums).toMatchObject([{ albumId: c1, placement: "listed", rating: null }]);
    expect(cat.score).toBeNull();
    expect(cat.ratedAlbumCount).toBe(0);
  });

  it("an unknown artist is undefined", () => {
    expect(loadArtistPage(seed().db, 9999)).toBeUndefined();
  });
});
