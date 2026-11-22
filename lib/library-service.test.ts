import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { createAlbum, findAlbumByCatalogId, getAlbum, listAlbums } from "./db/albums";
import { getLibraryEntry, listLibrary } from "./db/library";
import { countMatchups, listMatchups, recordMatchup } from "./db/matchups";
import { memoryDb } from "./db/test-db";
import { ADD_ALBUM_ERRORS, addCatalogAlbumToLibrary, removeFromLibrary, validateCatalogAlbum, validateLibraryYear, type AddAlbumErrorCode, type AddCatalogAlbumInput } from "./library-service";
import { computeRatings } from "./elo/replay";
import { loadRatings } from "./ratings";

const CATALOG_ID = "11111111-2222-3333-4444-555555555555";
const OTHER_CATALOG_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const ARTIST_ID = "bbbbbbbb-1111-2222-3333-444444444444";
const OTHER_ARTIST_ID = "cccccccc-1111-2222-3333-444444444444";
const THIRD_ARTIST_ID = "dddddddd-1111-2222-3333-444444444444";

const input = (overrides: Partial<AddCatalogAlbumInput> = {}): AddCatalogAlbumInput => ({
  catalogId: CATALOG_ID,
  title: "Kind of Blue",
  artist: "Miles Davis",
  artistId: ARTIST_ID,
  releaseYear: "1959",
  coverUrl: `https://coverartarchive.org/release-group/${CATALOG_ID}/front-250`,
  year: "1959",
  ...overrides,
});

describe("addCatalogAlbumToLibrary", () => {
  let db: DatabaseSync;
  beforeEach(() => {
    db = memoryDb();
  });

  it("creates the album and artist and files it under the catalog year", () => {
    expect(addCatalogAlbumToLibrary(db, input())).toEqual({ ok: true, added: true });

    const album = findAlbumByCatalogId(db, CATALOG_ID)!;
    expect(album).toMatchObject({
      title: "Kind of Blue",
      artist: { name: "Miles Davis", catalogId: ARTIST_ID },
      releaseYear: 1959,
      coverUrl: `https://coverartarchive.org/release-group/${CATALOG_ID}/front-250`,
    });
    expect(getLibraryEntry(db, album.id)).toMatchObject({ year: 1959, source: null });
  });

  it("files it under a different year than the catalog's and keeps the catalog year as the release year", () => {
    addCatalogAlbumToLibrary(db, input({ year: 1960 }));
    const album = findAlbumByCatalogId(db, CATALOG_ID)!;
    expect(album.releaseYear).toBe(1959);
    expect(getLibraryEntry(db, album.id)!.year).toBe(1960);
  });

  it("takes a catalog entry with no year, cover or artist id", () => {
    const result = addCatalogAlbumToLibrary(db, input({ releaseYear: null, coverUrl: "", artistId: null, year: 1971 }));
    expect(result).toEqual({ ok: true, added: true });
    expect(findAlbumByCatalogId(db, CATALOG_ID)).toMatchObject({ releaseYear: null, coverUrl: null, artist: { catalogId: null } });
  });

  it("takes a collaboration artist id, stored lower-case", () => {
    const artistId = `${ARTIST_ID.toUpperCase()}+${OTHER_ARTIST_ID}`;
    expect(addCatalogAlbumToLibrary(db, input({ artistId }))).toEqual({ ok: true, added: true });
    expect(findAlbumByCatalogId(db, CATALOG_ID)!.artist.catalogId).toBe(artistId.toLowerCase());
  });

  it("stores an upper-case catalog id lower-case and treats it as the same album", () => {
    expect(addCatalogAlbumToLibrary(db, input({ catalogId: OTHER_CATALOG_ID.toUpperCase() }))).toEqual({ ok: true, added: true });
    expect(findAlbumByCatalogId(db, OTHER_CATALOG_ID)).toBeDefined();
    expect(addCatalogAlbumToLibrary(db, input({ catalogId: OTHER_CATALOG_ID }))).toEqual({ ok: true, added: false });
    expect(listAlbums(db)).toHaveLength(1);
  });

  it.each([1, 2100])("takes a release year of %i", (releaseYear) => {
    expect(addCatalogAlbumToLibrary(db, input({ releaseYear }))).toEqual({ ok: true, added: true });
  });

  it("shares an artist between albums with the same catalog artist id", () => {
    addCatalogAlbumToLibrary(db, input());
    addCatalogAlbumToLibrary(db, input({ catalogId: OTHER_CATALOG_ID, title: "Sketches of Spain", year: 1960 }));
    const [first, second] = listAlbums(db);
    expect(first.artist.id).toBe(second.artist.id);
  });

  it("adds an existing album that is not in the library yet, without a second album row", () => {
    const existing = createAlbum(db, { title: "Kind of Blue", artist: { name: "Miles Davis" }, catalogId: CATALOG_ID });
    expect(addCatalogAlbumToLibrary(db, input({ year: 1960 }))).toEqual({ ok: true, added: true });
    expect(listAlbums(db)).toHaveLength(1);
    expect(getLibraryEntry(db, existing.id)!.year).toBe(1960);
  });

  it("does nothing the second time and keeps the first year", () => {
    addCatalogAlbumToLibrary(db, input({ year: 1959 }));
    const albumsBefore = listAlbums(db);
    const entriesBefore = listLibrary(db);

    expect(addCatalogAlbumToLibrary(db, input({ year: 1970, title: "Changed" }))).toEqual({ ok: true, added: false });
    expect(listAlbums(db)).toEqual(albumsBefore);
    expect(listLibrary(db)).toEqual(entriesBefore);
  });

  it.each([
    { name: "0", year: 0 },
    { name: "1899", year: 1899 },
    { name: "2101", year: 2101 },
    { name: "a fraction", year: 1964.5 },
    { name: "a fraction as text", year: "1964.5" },
    { name: "empty", year: "" },
    { name: "missing", year: null },
    { name: "text", year: "nineteen" },
  ])("refuses the year $name and writes nothing", ({ year }) => {
    expect(addCatalogAlbumToLibrary(db, input({ year }))).toEqual({ ok: false, code: "year", message: "Enter a year from 1900 to 2100." });
    expect(listAlbums(db)).toEqual([]);
  });

  it.each([
    { name: "1900", year: "1900" },
    { name: "2100", year: " 2100 " },
  ])("takes the year $name", ({ year }) => {
    expect(addCatalogAlbumToLibrary(db, input({ year }))).toEqual({ ok: true, added: true });
  });

  it.each([
    { name: "the Cover Art Archive", coverUrl: `https://coverartarchive.org/release-group/${CATALOG_ID}/front-250` },
    { name: "the Deezer CDN", coverUrl: "https://cdn-images.dzcdn.net/images/cover/abc/250x250-000000-80-0-0.jpg" },
    { name: "the second Deezer CDN host", coverUrl: "https://e-cdns-images.dzcdn.net/images/cover/abc/250x250-000000-80-0-0.jpg" },
  ])("stores a cover from $name", ({ coverUrl }) => {
    expect(addCatalogAlbumToLibrary(db, input({ coverUrl }))).toEqual({ ok: true, added: true });
    expect(findAlbumByCatalogId(db, CATALOG_ID)!.coverUrl).toBe(coverUrl);
  });

  it.each([
    { code: "catalog_id", name: "a catalog id that is too short", overrides: { catalogId: "1111" } },
    { code: "catalog_id", name: "a catalog id with other characters", overrides: { catalogId: "zzzzzzzz-2222-3333-4444-555555555555" } },
    { code: "catalog_id", name: "a missing catalog id", overrides: { catalogId: null } },
    { code: "title", name: "an empty title", overrides: { title: "   " } },
    { code: "title", name: "a title over 300 characters", overrides: { title: "t".repeat(301) } },
    { code: "artist", name: "an empty artist", overrides: { artist: "" } },
    { code: "artist", name: "an artist over 300 characters", overrides: { artist: "a".repeat(301) } },
    { code: "cover", name: "a cover from another host", overrides: { coverUrl: "https://example.com/cover.jpg" } },
    { code: "cover", name: "a cover over plain http", overrides: { coverUrl: "http://coverartarchive.org/x" } },
    { code: "cover", name: "a cover on a look-alike of the CAA host", overrides: { coverUrl: "https://coverartarchive.org.evil.com/x" } },
    { code: "cover", name: "a cover on a look-alike of the Deezer host", overrides: { coverUrl: "https://cdn-images.dzcdn.net.evil.com/x.jpg" } },
    { code: "cover", name: "a Deezer cover over plain http", overrides: { coverUrl: "http://cdn-images.dzcdn.net/x.jpg" } },
    { code: "cover", name: "a cover over 300 characters", overrides: { coverUrl: `https://coverartarchive.org/${"x".repeat(300)}` } },
    { code: "release_year", name: "a fractional release year", overrides: { releaseYear: "1959.5" } },
    { code: "release_year", name: "a text release year", overrides: { releaseYear: "soon" } },
    { code: "release_year", name: "a release year of 0", overrides: { releaseYear: 0 } },
    { code: "release_year", name: "a release year of 2101", overrides: { releaseYear: "2101" } },
    { code: "release_year", name: "a huge release year", overrides: { releaseYear: "99999999999999999999" } },
    { code: "artist_id", name: "an artist id that is not an id", overrides: { artistId: "artist-1" } },
    { code: "artist_id", name: "an artist id with a trailing plus", overrides: { artistId: `${ARTIST_ID}+` } },
    { code: "artist_id", name: "an artist id with a bad second id", overrides: { artistId: `${ARTIST_ID}+nope` } },
    { code: "artist_id", name: "an artist id over 400 characters", overrides: { artistId: Array(12).fill(ARTIST_ID).join("+") } },
  ])("refuses $name with the code $code and writes nothing", ({ code, overrides }) => {
    const result = addCatalogAlbumToLibrary(db, input(overrides));
    expect(result).toEqual({ ok: false, code, message: ADD_ALBUM_ERRORS[code as AddAlbumErrorCode] });
    expect(listAlbums(db)).toEqual([]);
    expect(listLibrary(db)).toEqual([]);
  });
});

describe("validateCatalogAlbum", () => {
  const fields = (overrides: Partial<AddCatalogAlbumInput> = {}) => {
    const { catalogId, title, artist, artistId, releaseYear } = input(overrides);
    return { catalogId, title, artist, artistId, releaseYear };
  };

  it.each([
    { name: "a catalog id that is not a UUID", overrides: { catalogId: "x" }, code: "catalog_id" },
    { name: "a missing catalog id", overrides: { catalogId: null }, code: "catalog_id" },
    { name: "an artist id that is not UUIDs", overrides: { artistId: "artist-1" }, code: "artist_id" },
    { name: "an artist id over 400 characters", overrides: { artistId: Array(12).fill(ARTIST_ID).join("+") }, code: "artist_id" },
    { name: "an empty title", overrides: { title: "  " }, code: "title" },
    { name: "a title of 301 characters", overrides: { title: "t".repeat(301) }, code: "title" },
    { name: "an empty artist", overrides: { artist: "" }, code: "artist" },
    { name: "an artist of 301 characters", overrides: { artist: "a".repeat(301) }, code: "artist" },
    { name: "a release year of 0", overrides: { releaseYear: "0" }, code: "release_year" },
    { name: "a release year of 99999", overrides: { releaseYear: "99999" }, code: "release_year" },
    { name: "a release year that is text", overrides: { releaseYear: "abc" }, code: "release_year" },
    { name: "a release year with a fraction", overrides: { releaseYear: "1959.5" }, code: "release_year" },
    { name: "a bad catalog id and a bad title (the catalog id is reported)", overrides: { catalogId: "x", title: "" }, code: "catalog_id" },
    { name: "a bad title and a bad release year (the title is reported)", overrides: { title: "", releaseYear: "abc" }, code: "title" },
  ])("refuses $name", ({ overrides, code }) => {
    expect(validateCatalogAlbum(fields(overrides))).toEqual({ ok: false, code, message: ADD_ALBUM_ERRORS[code as AddAlbumErrorCode] });
  });

  it.each([
    {
      name: "lower-cases the ids, trims the text and reads the release year as a number",
      overrides: { catalogId: ` ${CATALOG_ID.toUpperCase()} `, artistId: ARTIST_ID.toUpperCase(), title: " Kind of Blue ", artist: " Miles Davis ", releaseYear: " 1959 " },
      album: { catalogId: CATALOG_ID, artistId: ARTIST_ID, title: "Kind of Blue", artist: "Miles Davis", releaseYear: 1959 },
    },
    {
      name: "turns an empty artist id and release year into null",
      overrides: { artistId: "  ", releaseYear: "" },
      album: { catalogId: CATALOG_ID, artistId: null, title: "Kind of Blue", artist: "Miles Davis", releaseYear: null },
    },
    {
      name: "takes a collaboration artist id",
      overrides: { artistId: `${ARTIST_ID}+${OTHER_ARTIST_ID}` },
      album: { catalogId: CATALOG_ID, artistId: `${ARTIST_ID}+${OTHER_ARTIST_ID}`, title: "Kind of Blue", artist: "Miles Davis", releaseYear: 1959 },
    },
    {
      name: "takes the release years 1 and 2100",
      overrides: { releaseYear: 1 },
      album: { catalogId: CATALOG_ID, artistId: ARTIST_ID, title: "Kind of Blue", artist: "Miles Davis", releaseYear: 1 },
    },
    {
      name: "takes a title of 300 characters",
      overrides: { title: "t".repeat(300) },
      album: { catalogId: CATALOG_ID, artistId: ARTIST_ID, title: "t".repeat(300), artist: "Miles Davis", releaseYear: 1959 },
    },
  ])("$name", ({ overrides, album }) => {
    expect(validateCatalogAlbum(fields(overrides))).toEqual({ ok: true, album });
  });
});

describe("validateLibraryYear", () => {
  it.each([
    { name: "1900", value: "1900", ok: true },
    { name: "2100 with spaces", value: " 2100 ", ok: true },
    { name: "1899", value: 1899, ok: false },
    { name: "2101", value: "2101", ok: false },
    { name: "a fraction", value: "1964.5", ok: false },
    { name: "empty", value: "", ok: false },
    { name: "missing", value: null, ok: false },
  ])("$name", ({ value, ok }) => {
    const result = validateLibraryYear(value);
    expect(result.ok).toBe(ok);
    if (!result.ok) expect(result).toEqual({ ok: false, code: "year", message: "Enter a year from 1900 to 2100." });
  });
});

describe("removeFromLibrary", () => {
  let db: DatabaseSync;
  let miles: number;
  let coltrane: number;
  let evans: number;

  function add(catalogId: string, title: string, artist: string, artistId: string, year: number): number {
    addCatalogAlbumToLibrary(db, input({ catalogId, title, artist, artistId, year, releaseYear: year }));
    return findAlbumByCatalogId(db, catalogId)!.id;
  }

  beforeEach(() => {
    db = memoryDb();
    miles = add(CATALOG_ID, "Kind of Blue", "Miles Davis", ARTIST_ID, 1959);
    coltrane = add(OTHER_CATALOG_ID, "Giant Steps", "John Coltrane", OTHER_ARTIST_ID, 1960);
    evans = add("99999999-8888-7777-6666-555555555555", "Waltz for Debby", "Bill Evans", THIRD_ARTIST_ID, 1961);
    recordMatchup(db, { albumAId: miles, albumBId: coltrane, result: "a", createdAt: "2024-01-01T00:00:00.000Z" });
    recordMatchup(db, { albumAId: evans, albumBId: miles, result: "b", createdAt: "2024-01-02T00:00:00.000Z" });
    recordMatchup(db, { albumAId: coltrane, albumBId: evans, result: "a", createdAt: "2024-01-03T00:00:00.000Z" });
  });

  it("deletes the album, its library entry and its matchups, and keeps the others' matchups", () => {
    expect(removeFromLibrary(db, miles, 2)).toEqual({ ok: true, title: "Kind of Blue", matchups: 2 });

    expect(getAlbum(db, miles)).toBeUndefined();
    expect(getLibraryEntry(db, miles)).toBeUndefined();
    expect(listMatchups(db).map((m) => [m.albumAId, m.albumBId])).toEqual([[coltrane, evans]]);
  });

  it("takes the album id and count as form text", () => {
    expect(removeFromLibrary(db, String(miles), "2")).toMatchObject({ ok: true });
  });

  it("leaves the opponents rated as a replay of only their remaining matchups gives", () => {
    const before = loadRatings(db).ratings;
    removeFromLibrary(db, miles, 2);

    const after = loadRatings(db).ratings;
    const replay = computeRatings({ albumIds: [coltrane, evans], matchups: listMatchups(db) }).ratings;
    expect(after.get(coltrane)).toBe(replay.get(coltrane));
    expect(after.get(evans)).toBe(replay.get(evans));
    expect(after.get(coltrane)).not.toBe(before.get(coltrane));
  });

  it("keeps the artist while it has other albums, and drops it when none remain", () => {
    add("00000000-0000-0000-0000-000000000001", "Sketches of Spain", "Miles Davis", ARTIST_ID, 1960);
    removeFromLibrary(db, miles, 2);
    expect(listAlbums(db).some((album) => album.artist.name === "Miles Davis")).toBe(true);

    const other = findAlbumByCatalogId(db, "00000000-0000-0000-0000-000000000001")!;
    removeFromLibrary(db, other.id, 0);
    expect(listAlbums(db).some((album) => album.artist.name === "Miles Davis")).toBe(false);
  });

  it.each([
    { name: "fewer than the album has", expected: 1 },
    { name: "more than the album has", expected: 3 },
    { name: "not a number", expected: "many" },
    { name: "missing", expected: null },
  ])("deletes nothing when the expected count is $name, and reports the current count", ({ expected }) => {
    expect(removeFromLibrary(db, miles, expected)).toEqual({
      ok: false,
      stale: true,
      matchups: 2,
      message: "This album now has 2 matchups. Check and confirm again.",
    });
    expect(getLibraryEntry(db, miles)).toBeDefined();
    expect(countMatchups(db)).toBe(3);
  });

  it("words a single current matchup in the singular", () => {
    const solo = add("00000000-0000-0000-0000-000000000002", "Solo", "Solo Artist", "eeeeeeee-1111-2222-3333-444444444444", 1962);
    recordMatchup(db, { albumAId: solo, albumBId: miles, result: "a" });
    expect(removeFromLibrary(db, solo, 0)).toMatchObject({ message: "This album now has 1 matchup. Check and confirm again." });
  });

  it.each([
    { name: "an unknown id", albumId: 9999 },
    { name: "a non-numeric id", albumId: "abc" },
    { name: "a missing id", albumId: null },
  ])("fails for $name", ({ albumId }) => {
    expect(removeFromLibrary(db, albumId, 0)).toEqual({ ok: false, message: "That album isn't in your library." });
    expect(countMatchups(db)).toBe(3);
  });

  it("fails for an album that exists but is not in the library", () => {
    const outside = createAlbum(db, { title: "Outside", artist: { name: "Nobody" } }).id;
    expect(removeFromLibrary(db, outside, 0)).toEqual({ ok: false, message: "That album isn't in your library." });
    expect(getAlbum(db, outside)).toBeDefined();
  });
});
