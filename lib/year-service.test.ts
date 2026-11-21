import { describe, expect, it } from "vitest";
import { findAlbumByCatalogId, getAlbum, listAlbums } from "./db/albums";
import { recordMatchup } from "./db/matchups";
import { memoryDb, seedAlbums } from "./db/test-db";
import { addYearEntry, listAllYearEntries, listYear } from "./db/year-entries";
import { addFromCatalog, addManual, listYears, loadYearView, saveYear } from "./year-service";

const empty = { ranked: [], honorableMentions: [], listed: [] };

const catalog = (n: number, overrides: Record<string, unknown> = {}) => ({
  catalogId: `mbid-${n}`,
  title: `Catalog ${n}`,
  artist: `Band ${n}`,
  artistId: `artist-${n}`,
  year: 1987,
  coverUrl: `https://coverartarchive.org/release-group/mbid-${n}/front-250`,
  ...overrides,
});

const rankedIds = (db: ReturnType<typeof memoryDb>, year: number) =>
  listYear(db, year)
    .filter((entry) => entry.placement === "ranked")
    .map((entry) => [entry.albumId, entry.rank]);

describe("saveYear", () => {
  it("reordering rank 4 to rank 1 stores ranks 1 to 4 shifted, and a fresh load returns the new order", () => {
    const db = memoryDb();
    const [a, b, c, d] = seedAlbums(db, 4);
    saveYear(db, 1987, { ranked: [a, b, c, d], honorableMentions: [], listed: [] });

    const result = saveYear(db, 1987, { ranked: [d, a, b, c], honorableMentions: [], listed: [] });

    expect("view" in result).toBe(true);
    expect(rankedIds(db, 1987)).toEqual([[d, 1], [a, 2], [b, 3], [c, 4]]);
    expect(loadYearView(db, 1987).ranked.map((album) => album.id)).toEqual([d, a, b, c]);
  });

  it("a year with 3 ranked albums saves and loads with 3 ranks", () => {
    const db = memoryDb();
    const [a, b, c] = seedAlbums(db, 3);
    saveYear(db, 1987, { ranked: [a, b, c], honorableMentions: [], listed: [] });

    const view = loadYearView(db, 1987);
    expect(view.ranked.map((album) => album.rank)).toEqual([1, 2, 3]);
  });

  it("a gap in stored ranks is shown as stored and closes on save", () => {
    const db = memoryDb();
    const [a, b, c] = seedAlbums(db, 3);
    addYearEntry(db, { albumId: a, year: 1987, placement: "ranked", rank: 1 });
    addYearEntry(db, { albumId: b, year: 1987, placement: "ranked", rank: 2 });
    addYearEntry(db, { albumId: c, year: 1987, placement: "ranked", rank: 4 });
    expect(loadYearView(db, 1987).ranked.map((album) => album.rank)).toEqual([1, 2, 4]);

    saveYear(db, 1987, { ranked: [a, b, c], honorableMentions: [], listed: [] });

    expect(loadYearView(db, 1987).ranked.map((album) => album.rank)).toEqual([1, 2, 3]);
  });

  it("moves an album between the three areas, and removing it keeps the album", () => {
    const db = memoryDb();
    const [a, b] = seedAlbums(db, 2);
    saveYear(db, 1987, { ranked: [a, b], honorableMentions: [], listed: [] });

    saveYear(db, 1987, { ranked: [a], honorableMentions: [b], listed: [] });
    expect(listYear(db, 1987).map((entry) => [entry.albumId, entry.placement])).toEqual([
      [a, "ranked"],
      [b, "honorable_mention"],
    ]);

    saveYear(db, 1987, { ranked: [a], honorableMentions: [], listed: [b] });
    expect(loadYearView(db, 1987).listed.map((album) => album.id)).toEqual([b]);

    saveYear(db, 1987, { ranked: [a], honorableMentions: [], listed: [] });
    expect(listYear(db, 1987).map((entry) => entry.albumId)).toEqual([a]);
    expect(getAlbum(db, b)).toBeDefined();
  });

  it("names the decade list entries a save removed", () => {
    const db = memoryDb();
    const [a] = seedAlbums(db, 1);
    saveYear(db, 1987, { ranked: [a], honorableMentions: [], listed: [] });
    db.prepare("INSERT INTO decade_list_entries (decade, album_id, position) VALUES (1980, ?, 1)").run(a);

    const result = saveYear(db, 1987, { ranked: [], honorableMentions: [], listed: [a] });

    expect(result).toMatchObject({ removedDecadeEntries: [{ decade: 1980, title: "Album 1" }] });
  });

  it.each([
    { name: "eleven ranked albums", year: 1987, placements: (ids: number[]) => ({ ...empty, ranked: ids.slice(0, 11) }) },
    { name: "a duplicate id", year: 1987, placements: (ids: number[]) => ({ ...empty, ranked: [ids[0]], listed: [ids[0]] }) },
    { name: "a year out of range", year: 2101, placements: (ids: number[]) => ({ ...empty, ranked: [ids[0]] }) },
    { name: "a year that is not a whole number", year: 1987.5, placements: (ids: number[]) => ({ ...empty, ranked: [ids[0]] }) },
    { name: "an id that is not a positive whole number", year: 1987, placements: () => ({ ...empty, ranked: [0] }) },
  ])("refuses $name and stores nothing", ({ year, placements }) => {
    const db = memoryDb();
    const ids = seedAlbums(db, 11);
    saveYear(db, 1990, { ranked: [ids[5]], honorableMentions: [], listed: [] });
    const before = listAllYearEntries(db);

    const result = saveYear(db, year, placements(ids));

    expect(result).toHaveProperty("error");
    expect(listAllYearEntries(db)).toEqual(before);
  });
});

describe("loadYearView", () => {
  it("rates ranked and honorable mention albums from the replay, rounded, and listed albums have none", () => {
    const db = memoryDb();
    const [a, b, c, other] = seedAlbums(db, 4);
    saveYear(db, 1987, { ranked: [a], honorableMentions: [b], listed: [c] });
    saveYear(db, 1990, { ranked: [other], honorableMentions: [], listed: [] });

    const before = loadYearView(db, 1987);
    expect(before.ranked[0].rating).toBe(1516);
    expect(before.honorableMentions[0].rating).toBe(1484);
    expect(before.listed[0].rating).toBeNull();

    // The matchup is part of the replay: the 1500 album beating the 1516 one takes about 16.7 points from it.
    recordMatchup(db, { albumAId: other, albumBId: a, result: "a" });
    expect(loadYearView(db, 1987).ranked[0].rating).toBe(1499);
  });

  it("sorts honorable mentions and listed albums by artist, then title", () => {
    const db = memoryDb();
    const [a, b, c, d, e, f] = seedAlbums(db, 6); // Artist 1 to 6
    saveYear(db, 1987, { ranked: [], honorableMentions: [c, a, b], listed: [f, d, e] });

    const view = loadYearView(db, 1987);
    expect(view.honorableMentions.map((album) => album.id)).toEqual([a, b, c]);
    expect(view.listed.map((album) => album.id)).toEqual([d, e, f]);
  });
});

describe("listYears", () => {
  it("lists years with entries and their counts", () => {
    const db = memoryDb();
    const [a, b, c] = seedAlbums(db, 3);
    saveYear(db, 1990, { ranked: [a], honorableMentions: [b], listed: [c] });
    expect(listYears(db)).toEqual([{ year: 1990, ranked: 1, honorableMentions: 1, listed: 1 }]);
  });
});

describe("addFromCatalog", () => {
  it("creates the album once, with the artist's catalog id, and reuses it by catalog id", () => {
    const db = memoryDb();
    addFromCatalog(db, 1987, catalog(1), "ranked");
    addFromCatalog(db, 1987, catalog(1), "ranked"); // already on this page
    expect(listAlbums(db)).toHaveLength(1);

    // Removed, then added again to another year: the same album row is reused.
    saveYear(db, 1987, empty);
    const result = addFromCatalog(db, 1988, catalog(1), "listed");

    expect(listAlbums(db)).toHaveLength(1);
    expect(result).toMatchObject({ view: { year: 1988, listed: [{ title: "Catalog 1" }] } });
    expect(findAlbumByCatalogId(db, "mbid-1")!.artist.catalogId).toBe("artist-1");
  });

  it("appends ranked albums at the end", () => {
    const db = memoryDb();
    addFromCatalog(db, 1987, catalog(1), "ranked");
    const result = addFromCatalog(db, 1987, catalog(2), "ranked");
    expect(result).toMatchObject({ view: { ranked: [{ title: "Catalog 1", rank: 1 }, { title: "Catalog 2", rank: 2 }] } });
  });

  it("refuses ranked when it is full and stores nothing", () => {
    const db = memoryDb();
    const ids = seedAlbums(db, 10);
    saveYear(db, 1987, { ranked: ids, honorableMentions: [], listed: [] });

    const result = addFromCatalog(db, 1987, catalog(1), "ranked");

    expect(result).toHaveProperty("error");
    expect(listAlbums(db)).toHaveLength(10);
  });

  it("an album on another year returns the conflict and stores nothing; with move it ends up only on the new year", () => {
    const db = memoryDb();
    addFromCatalog(db, 1987, catalog(1), "listed");
    const [other] = seedAlbums(db, 1);
    saveYear(db, 1987, { ranked: [other], honorableMentions: [], listed: [findAlbumByCatalogId(db, "mbid-1")!.id] });
    const before = listAllYearEntries(db);

    const conflict = addFromCatalog(db, 1990, catalog(1), "ranked");
    expect(conflict).toEqual({ conflict: { year: 1987, placement: "listed", rank: null, title: "Catalog 1" } });
    expect(listAllYearEntries(db)).toEqual(before);

    const moved = addFromCatalog(db, 1990, catalog(1), "ranked", true);
    expect(moved).toMatchObject({ view: { year: 1990, ranked: [{ title: "Catalog 1", rank: 1 }] } });
    expect(loadYearView(db, 1987).listed).toEqual([]);
    expect(loadYearView(db, 1987).ranked.map((album) => album.id)).toEqual([other]);
  });

  it("an album already on this year changes nothing", () => {
    const db = memoryDb();
    addFromCatalog(db, 1987, catalog(1), "honorable_mention");
    const before = listAllYearEntries(db);

    const result = addFromCatalog(db, 1987, catalog(1), "ranked");

    expect(result).toEqual({ error: "Catalog 1 is already on this page." });
    expect(listAllYearEntries(db)).toEqual(before);
  });

  it.each([
    {
      name: "a cover URL on another host or without https",
      albums: [catalog(1, { coverUrl: "https://example.com/cover.jpg" }), catalog(1, { coverUrl: "http://coverartarchive.org/a.jpg" })],
    },
    {
      name: "a title or artist that is empty, too long or not a string",
      albums: [catalog(1, { title: "  " }), catalog(1, { title: "x".repeat(301) }), catalog(1, { artist: 7 })],
    },
    { name: "a release year that is not a whole number", albums: [catalog(1, { year: "1987" })] },
  ])("refuses $name and stores nothing", ({ albums }) => {
    for (const album of albums) {
      const db = memoryDb();

      expect(addFromCatalog(db, 1987, album, "ranked")).toHaveProperty("error");
      expect(listAlbums(db)).toEqual([]);
      expect(listAllYearEntries(db)).toEqual([]);
    }
  });

  it("accepts a result with no cover and no release year", () => {
    const db = memoryDb();
    const result = addFromCatalog(db, 1987, catalog(1, { coverUrl: null, year: null }), "listed");
    expect(result).toHaveProperty("view");
  });
});

describe("addManual", () => {
  it("creates an album with no catalog id and no cover and places it in the year", () => {
    const db = memoryDb();

    const result = addManual(db, 1987, { title: "Home Tape", artist: "Me", releaseYear: 1987, area: "honorable_mention" });

    expect(result).toMatchObject({ view: { honorableMentions: [{ title: "Home Tape", coverUrl: null, rating: 1500 }] } });
    const [album] = listAlbums(db);
    expect(album).toMatchObject({ catalogId: null, coverUrl: null, releaseYear: 1987 });
  });

  it.each([
    { name: "a missing title", input: { title: " ", artist: "Me", area: "listed" } },
    { name: "a missing artist", input: { title: "Home Tape", artist: "", area: "listed" } },
    { name: "a release year that is not a whole number", input: { title: "T", artist: "A", releaseYear: 1987.5, area: "listed" } },
    { name: "an unknown area", input: { title: "T", artist: "A", area: "top" } },
  ])("refuses $name and stores nothing", ({ input }) => {
    const db = memoryDb();
    expect(addManual(db, 1987, input)).toHaveProperty("error");
    expect(listAlbums(db)).toEqual([]);
  });
});
