import { describe, expect, it, vi } from "vitest";
import { chooseMatch, matchRow } from "./match.ts";
import { catalogAlbum, importRow } from "./test-support.ts";

const row = (title: string, artist: string, year = 2001) => importRow({ key: { title, artist, year } });

describe("chooseMatch", () => {
  it("accepts exactly one clear match", () => {
    const one = catalogAlbum("a", "Fake Album One", "Fake Artist A", 2001);
    const other = catalogAlbum("b", "Fake Album Two", "Fake Artist A", 2001);
    expect(chooseMatch(row("Fake Album One", "Fake Artist A"), [other, one])).toEqual({ kind: "accepted", album: one });
  });

  it("accepts a clear match whatever its release year", () => {
    const far = catalogAlbum("a", "Fake Album One", "Fake Artist A", 1975);
    expect(chooseMatch(row("Fake Album One", "Fake Artist A"), [far])).toEqual({ kind: "accepted", album: far });
  });

  const several = [
    {
      name: "exactly one within a year",
      years: [1990, 2002],
      outcome: "accepted",
      pick: 1,
    },
    { name: "one a year earlier", years: [2000, 1970], outcome: "accepted", pick: 0 },
    { name: "none within a year", years: [1990, 2010], outcome: "ambiguous", pick: null },
    { name: "two within a year", years: [2000, 2002], outcome: "ambiguous", pick: null },
    { name: "two years away is too far", years: [1999, 2003], outcome: "ambiguous", pick: null },
    { name: "an unknown year", years: [null, null], outcome: "ambiguous", pick: null },
  ];
  it.each(several)("with several clear matches, $name", ({ years, outcome, pick }) => {
    const results = years.map((year, i) => catalogAlbum(`id-${i}`, "Fake Album One", "Fake Artist A", year));
    const result = chooseMatch(row("Fake Album One", "Fake Artist A"), results);
    expect(result.kind).toBe(outcome);
    if (result.kind === "accepted") expect(result.album).toBe(results[pick!]);
    if (result.kind === "ambiguous") expect(result.candidates.map((c) => c.catalogId)).toEqual(["id-0", "id-1"]);
  });

  it("sends a typo to review as no match with the first 5 results", () => {
    const results = Array.from({ length: 8 }, (_, i) => catalogAlbum(`id-${i}`, `Fake Album ${i}`, "Fake Artist A", 2001));
    const result = chooseMatch(row("Fake Albm One", "Fake Artist A"), results);
    expect(result.kind).toBe("no_match");
    if (result.kind === "no_match") {
      expect(result.candidates.map((c) => c.catalogId)).toEqual(["id-0", "id-1", "id-2", "id-3", "id-4"]);
      expect(result.candidates[0]).toEqual({
        catalogId: "id-0",
        title: "Fake Album 0",
        artist: "Fake Artist A",
        artistId: "artist-Fake Artist A",
        releaseYear: 2001,
        coverUrl: "https://covers.test/id-0",
      });
    }
  });

  it("sends no results to review as no match", () => {
    expect(chooseMatch(row("Fake Album One", "Fake Artist A"), [])).toEqual({ kind: "no_match", candidates: [] });
  });

  it("needs the artist to match too", () => {
    const wrongArtist = catalogAlbum("a", "Fake Album One", "Fake Artist Z", 2001);
    expect(chooseMatch(row("Fake Album One", "Fake Artist A"), [wrongArtist]).kind).toBe("no_match");
  });

  const normalized = [
    { name: "& against and", row: ["Fake Album", "Fake Artist N and Fake Artist O"], catalog: ["Fake Album", "Fake Artist N & Fake Artist O"] },
    { name: "a leading The on the title", row: ["Fake Album", "Fake Artist A"], catalog: ["The Fake Album", "Fake Artist A"] },
    { name: "a leading The on the artist", row: ["Fake Album", "The Fake Artist A"], catalog: ["Fake Album", "Fake Artist A"] },
    { name: "a (Remastered) suffix", row: ["Fake Album (Remastered)", "Fake Artist A"], catalog: ["Fake Album", "Fake Artist A"] },
    { name: "a [Deluxe Edition] suffix in the catalog", row: ["Fake Album", "Fake Artist A"], catalog: ["Fake Album [Deluxe Edition]", "Fake Artist A"] },
    { name: "accents and case", row: ["fake album", "fake artist á"], catalog: ["Fake Album", "Fake Artist A"] },
  ];
  it.each(normalized)("matches through $name", ({ row: [title, artist], catalog: [catTitle, catArtist] }) => {
    const album = catalogAlbum("a", catTitle, catArtist, 2001);
    expect(chooseMatch(row(title, artist), [album])).toEqual({ kind: "accepted", album });
  });
});

describe("matchRow", () => {
  it("searches for the album and artist together", async () => {
    const search = vi.fn(async () => [catalogAlbum("a", "Fake Album One", "Fake Artist A", 2001)]);
    const result = await matchRow(row("Fake Album One", "Fake Artist A"), search);
    expect(search).toHaveBeenCalledExactlyOnceWith("Fake Album One Fake Artist A");
    expect(result.kind).toBe("accepted");
  });

  it("passes a catalog failure on", async () => {
    await expect(matchRow(row("A", "B"), async () => Promise.reject(new Error("busy")))).rejects.toThrow("busy");
  });
});
