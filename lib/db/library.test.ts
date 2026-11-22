import { describe, expect, it } from "vitest";
import { addToLibrary, findLibraryEntryBySource, getLibraryEntry, listLibrary, setLibraryYear } from "./library";
import { errorCode, memoryDb, seedAlbums } from "./test-db";

const SOURCE = { title: "Fake Album", artist: "Fake Artist", year: 1975 };

describe("library", () => {
  it("adds an album with its year, added time and source, and lists the library by year", () => {
    const db = memoryDb();
    const [a, b, c] = seedAlbums(db, 3);
    addToLibrary(db, { albumId: a, year: 1999 });
    addToLibrary(db, { albumId: b, year: 1975, source: SOURCE });
    addToLibrary(db, { albumId: c, year: 1975 });

    expect(listLibrary(db).map((e) => [e.albumId, e.year])).toEqual([
      [b, 1975],
      [c, 1975],
      [a, 1999],
    ]);
    expect(getLibraryEntry(db, b)).toMatchObject({ albumId: b, year: 1975, source: SOURCE });
    expect(getLibraryEntry(db, b)!.addedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(getLibraryEntry(db, a)!.source).toBeNull();
    expect(getLibraryEntry(db, 999)).toBeUndefined();
  });

  it("rejects adding the same album twice, and an unknown album", () => {
    const db = memoryDb();
    const [a] = seedAlbums(db, 1);
    addToLibrary(db, { albumId: a, year: 2000 });
    expect(errorCode(() => addToLibrary(db, { albumId: a, year: 2001 }))).toBe("album_in_library");
    expect(errorCode(() => addToLibrary(db, { albumId: 999, year: 2001 }))).toBe("not_found");
    expect(getLibraryEntry(db, a)!.year).toBe(2000);
  });

  it("finds an entry by its exact source row, and rejects a second album with the same source", () => {
    const db = memoryDb();
    const [a, b] = seedAlbums(db, 2);
    addToLibrary(db, { albumId: a, year: 1975, source: SOURCE });
    expect(findLibraryEntryBySource(db, SOURCE)!.albumId).toBe(a);
    expect(findLibraryEntryBySource(db, { ...SOURCE, title: "fake album" })).toBeUndefined();
    expect(errorCode(() => addToLibrary(db, { albumId: b, year: 1975, source: SOURCE }))).toBe("invalid_input");
  });

  it.each([
    { name: "1900", year: 1900, code: undefined },
    { name: "2100", year: 2100, code: undefined },
    { name: "1899", year: 1899, code: "invalid_input" },
    { name: "2101", year: 2101, code: "invalid_input" },
    { name: "a fraction", year: 1975.5, code: "invalid_input" },
    { name: "NaN", year: NaN, code: "invalid_input" },
  ])("checks the year bounds on add: $name", ({ year, code }) => {
    const db = memoryDb();
    const [a] = seedAlbums(db, 1);
    if (code) expect(errorCode(() => addToLibrary(db, { albumId: a, year }))).toBe(code);
    else expect(addToLibrary(db, { albumId: a, year }).year).toBe(year);
  });

  it.each([
    { name: "keeps the source when none is given", source: undefined, expected: SOURCE },
    { name: "replaces the source", source: { ...SOURCE, year: 1980 }, expected: { ...SOURCE, year: 1980 } },
    { name: "clears the source with null", source: null, expected: null },
  ])("sets the year and $name", ({ source, expected }) => {
    const db = memoryDb();
    const [a] = seedAlbums(db, 1);
    addToLibrary(db, { albumId: a, year: 1975, source: SOURCE });
    expect(setLibraryYear(db, a, 1982, source)).toMatchObject({ year: 1982, source: expected });
  });

  it("rejects a year out of bounds, an album not in the library, and a source another album holds", () => {
    const db = memoryDb();
    const [a, b] = seedAlbums(db, 2);
    addToLibrary(db, { albumId: a, year: 1975, source: SOURCE });
    addToLibrary(db, { albumId: b, year: 1976 });
    expect(errorCode(() => setLibraryYear(db, a, 1850))).toBe("invalid_input");
    expect(errorCode(() => setLibraryYear(db, 999, 1980))).toBe("not_found");
    expect(errorCode(() => setLibraryYear(db, b, 1980, SOURCE))).toBe("invalid_input");
    expect(getLibraryEntry(db, b)!.year).toBe(1976);
  });
});
