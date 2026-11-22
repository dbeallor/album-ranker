import { describe, expect, it, vi } from "vitest";
import type { CatalogAlbum, CatalogQuery } from "../catalog/types.ts";
import { gradeArtist, gradeTitle, type Grade } from "./grade.ts";
import {
  chooseMatch,
  defaultSearchText,
  matchRow,
  rankCandidates,
  rankStoredCandidates,
  searchForReview,
  toCandidate,
} from "./match.ts";
import { RECORDING_CATALOG, catalogAlbum, fakeCatalogSearch, importRow } from "./test-support.ts";
import type { CatalogSearch } from "./types.ts";

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
    if (result.kind === "ambiguous") expect(result.candidates.map((c) => c.catalogId).sort()).toEqual(["id-0", "id-1"]);
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
    const wrongArtist = catalogAlbum("a", "Fake Album One", "Somebody Else Entirely", 2001);
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

describe("gradeTitle", () => {
  const cases: { name: string; sheet: string; catalog: string; grade: Grade }[] = [
    { name: "equal after normalizing", sheet: "The Fake Album (Remastered)", catalog: "fake album", grade: "exact" },
    { name: "a catalog title with a subtitle after a colon", sheet: "Getz/Gilberto", catalog: "Getz/Gilberto: Deluxe", grade: "close" },
    { name: "a sheet title with a subtitle after a dash", sheet: "Fake Album - Live in Fake City", catalog: "Fake Album", grade: "close" },
    { name: "a subtitle after a slash", sheet: "Fake Album", catalog: "Fake Album / Fake Extra", grade: "close" },
    { name: "only separators differing", sheet: "Getz/Gilberto", catalog: "Getz / Gilberto", grade: "close" },
    { name: "extra words with no separator", sheet: "Fake Album", catalog: "Fake Album Deluxe Edition", grade: "none" },
    { name: "a hyphen inside a word is not a subtitle", sheet: "Fake", catalog: "Fake-Album", grade: "none" },
    { name: "one typo in long titles", sheet: "Meet the Tempations", catalog: "Meet the Temptations", grade: "close" },
    { name: "a typo in a short title", sheet: "Blur", catalog: "Blue", grade: "none" },
    { name: "two typos", sheet: "Meet the Tempatons", catalog: "Meet the Temptations", grade: "none" },
    { name: "a typo in each of two words", sheet: "Fake Albom Namez", catalog: "Fake Album Names", grade: "none" },
    { name: "a different volume number", sheet: "Greatest Hits Vol. 2", catalog: "Greatest Hits Vol. 3", grade: "none" },
    { name: "a different roman numeral", sheet: "Led Zeppelin II", catalog: "Led Zeppelin III", grade: "none" },
    { name: "a different year in the title", sheet: "Fake Album 2000", catalog: "Fake Album 2001", grade: "none" },
    { name: "a different number inside a long word", sheet: "Fake Blink182", catalog: "Fake Blink183", grade: "none" },
    { name: "words in another order", sheet: "Fake Album One", catalog: "One Fake Album", grade: "none" },
    { name: "a different title", sheet: "Fake Album One", catalog: "Fake Album Two", grade: "none" },
  ];
  it.each(cases)("$name is $grade", ({ sheet, catalog, grade }) => {
    expect(gradeTitle(sheet, catalog)).toBe(grade);
  });
});

describe("gradeArtist", () => {
  const cases: { name: string; sheet: string; catalog: string; grade: Grade }[] = [
    { name: "equal after normalizing", sheet: "The Temptations", catalog: "Temptations", grade: "exact" },
    { name: "the sheet name inside the catalog's", sheet: "Bill Evans", catalog: "Bill Evans Trio", grade: "close" },
    { name: "the catalog name inside the sheet's", sheet: "Bill Evans Trio", catalog: "Bill Evans", grade: "close" },
    { name: "a collaborator the sheet leaves out", sheet: "Stan Getz", catalog: "Stan Getz & João Gilberto", grade: "close" },
    {
      name: "a collaboration joined with & against /",
      sheet: "Stan Getz & Joao Gilberto",
      catalog: "Stan Getz / João Gilberto featuring Antônio Carlos Jobim",
      grade: "close",
    },
    { name: "one typo in long names", sheet: "Procol Harem", catalog: "Procol Harum", grade: "close" },
    { name: "a typo in a short name", sheet: "Blur", catalog: "Blue", grade: "none" },
    { name: "a one-word name inside a longer one", sheet: "Prince", catalog: "Prince Buster", grade: "none" },
    { name: "a name that is just The and a word, inside a longer one", sheet: "The Band", catalog: "The Band of Horses", grade: "none" },
    { name: "a different number in a name", sheet: "Fake Artist 2", catalog: "Fake Artist 3", grade: "none" },
    { name: "the same words in another order", sheet: "Joao Gilberto", catalog: "Gilberto Joao", grade: "none" },
    { name: "words only partly shared", sheet: "Bill Evans", catalog: "Bill Frisell", grade: "none" },
    { name: "a different artist", sheet: "Fake Artist A", catalog: "Somebody Else Entirely", grade: "none" },
  ];
  it.each(cases)("$name is $grade", ({ sheet, catalog, grade }) => {
    expect(gradeArtist(sheet, catalog)).toBe(grade);
  });
});

describe("ranking", () => {
  const sheet = row("Fake Album One", "Fake Artist A", 2001);
  const ids = (albums: { catalogId: string }[]) => albums.map((album) => album.catalogId);

  it("puts grade points first, then the nearer year, then the catalog's order", () => {
    const albums = [
      catalogAlbum("none", "Something Else", "Somebody Else Entirely", 2001),
      catalogAlbum("close-near", "Fake Album One: Live", "Fake Artist A", 2001),
      catalogAlbum("exact-far", "Fake Album One", "Fake Artist A", 1980),
      catalogAlbum("exact-near", "Fake Album One", "Fake Artist A", 2002),
      catalogAlbum("exact-unknown", "Fake Album One", "Fake Artist A", null),
      catalogAlbum("exact-near-again", "Fake Album One", "Fake Artist A", 2000),
      catalogAlbum("title-only", "Fake Album One", "Somebody Else Entirely", 2001),
    ];
    // exact/exact is 4 points, exact/close and close/exact 3, exact/none 2, none/none 0.
    expect(ids(rankCandidates(sheet, albums))).toEqual([
      "exact-near",
      "exact-near-again",
      "exact-far",
      "exact-unknown",
      "close-near",
      "title-only",
      "none",
    ]);
  });

  it("keeps the catalog's order when everything ties", () => {
    const albums = ["a", "b", "c"].map((id) => catalogAlbum(id, "Other", "Somebody Else Entirely", 2001));
    expect(ids(rankCandidates(sheet, albums))).toEqual(["a", "b", "c"]);
  });

  it("lets the year order candidates that match no better than each other", () => {
    const albums = [1975, 1999, 2010].map((year) => catalogAlbum(`y${year}`, "Fake Album One: Live", "Fake Artist A", year));
    expect(ids(rankCandidates(sheet, albums))).toEqual(["y1999", "y2010", "y1975"]);
  });

  it("ranks stored candidates the same way, by release year", () => {
    const far = toCandidate(catalogAlbum("far", "Fake Album One", "Fake Artist A", 1980));
    const near = toCandidate(catalogAlbum("near", "Fake Album One", "Fake Artist A", 2001));
    expect(ids(rankStoredCandidates(sheet, [far, near]))).toEqual(["near", "far"]);
  });
});

describe("chooseMatch with close matches", () => {
  const sheet = row("Meet the Temptations", "The Temptations", 1964);
  const typo = (id: string, year: number | null) => catalogAlbum(id, "Meet the Tempations", "The Temptations", year);

  const volume = row("Greatest Hits Vol. 2", "Fake Artist A", 1990);
  const zeppelin = row("Led Zeppelin II", "Led Zeppelin", 1969);
  const cases: {
    name: string;
    sheet?: ReturnType<typeof row>;
    results: ReturnType<typeof typo>[];
    outcome: "accepted" | "no_match";
    ids: string[];
  }[] = [
    { name: "one close match in the sheet's year is accepted", results: [typo("a", 1964)], outcome: "accepted", ids: ["a"] },
    { name: "one close match a year off is accepted", results: [typo("a", 1965)], outcome: "accepted", ids: ["a"] },
    { name: "a close match two years off goes to review", results: [typo("a", 1966)], outcome: "no_match", ids: ["a"] },
    { name: "a close match with no year goes to review", results: [typo("a", null)], outcome: "no_match", ids: ["a"] },
    {
      name: "two close matches go to review, the nearer year first",
      results: [typo("far", 1990), typo("near", 1964)],
      outcome: "no_match",
      ids: ["near", "far"],
    },
    {
      name: "another volume number in the sheet's year goes to review",
      sheet: volume,
      results: [catalogAlbum("a", "Greatest Hits Vol. 3", "Fake Artist A", 1990)],
      outcome: "no_match",
      ids: ["a"],
    },
    {
      name: "another roman numeral in the sheet's year goes to review",
      sheet: zeppelin,
      results: [catalogAlbum("a", "Led Zeppelin III", "Led Zeppelin", 1969)],
      outcome: "no_match",
      ids: ["a"],
    },
  ];
  it.each(cases)("$name", ({ sheet: own, results, outcome, ids }) => {
    const result = chooseMatch(own ?? sheet, results);
    expect(result.kind).toBe(outcome);
    if (result.kind === "accepted") expect(result.album.catalogId).toBe(ids[0]);
    if (result.kind === "no_match") expect(result.candidates.map((c) => c.catalogId)).toEqual(ids);
  });

  it("never accepts a match whose artist or title grades none", () => {
    const wrongArtist = catalogAlbum("a", "Meet the Temptations", "Somebody Else Entirely", 1964);
    const wrongTitle = catalogAlbum("b", "Something Else Entirely", "The Temptations", 1964);
    expect(chooseMatch(sheet, [wrongArtist]).kind).toBe("no_match");
    expect(chooseMatch(sheet, [wrongTitle]).kind).toBe("no_match");
  });

  it("accepts a lone close match even beside albums that match neither field", () => {
    const close = typo("close", 1964);
    const other = catalogAlbum("other", "Something Else Entirely", "Somebody Else Entirely", 1964);
    expect(chooseMatch(sheet, [other, close])).toEqual({ kind: "accepted", album: close });
  });

  it("lists several exact matches in ranking order when the year cannot choose", () => {
    const results = [1990, 1975, 2010].map((year) => catalogAlbum(`y${year}`, "Meet the Temptations", "The Temptations", year));
    const result = chooseMatch(sheet, results);
    expect(result.kind).toBe("ambiguous");
    if (result.kind === "ambiguous") expect(result.candidates.map((c) => c.catalogId)).toEqual(["y1975", "y1990", "y2010"]);
  });

  it("prefers an exact match over a close one without looking at years", () => {
    const exact = catalogAlbum("exact", "Meet the Temptations", "The Temptations", 1990);
    expect(chooseMatch(sheet, [typo("close", 1964), exact])).toEqual({ kind: "accepted", album: exact });
  });
});

describe("matchRow", () => {
  const text = (value: string): CatalogQuery => ({ kind: "text", text: value });
  /** The four searches of the ladder, in order. */
  const ladder = (title: string, artist: string): CatalogQuery[] => [
    text(`${title} ${artist}`),
    { kind: "fields", title, artist },
    { kind: "fields", title },
    { kind: "fields", artist },
  ];
  /** A search that answers every query with the same albums. */
  const fakeSearchOf = (albums: CatalogAlbum[], calls: CatalogQuery[]): CatalogSearch => async (query) => {
    calls.push(query);
    return albums;
  };

  it("searches for the album and artist together first", async () => {
    const search = vi.fn(async () => [catalogAlbum("a", "Fake Album One", "Fake Artist A", 2001)]);
    const result = await matchRow(row("Fake Album One", "Fake Artist A"), search);
    expect(search).toHaveBeenCalledExactlyOnceWith(text("Fake Album One Fake Artist A"));
    expect(result.kind).toBe("accepted");
  });

  it("passes a catalog failure on", async () => {
    await expect(matchRow(row("A", "B"), async () => Promise.reject(new Error("busy")))).rejects.toThrow("busy");
  });

  it("passes a failure on a later step on", async () => {
    let calls = 0;
    const search = async () => {
      if (++calls === 2) throw new Error("busy");
      return [];
    };
    await expect(matchRow(row("A Title", "An Artist"), search)).rejects.toThrow("busy");
  });

  it("tries every step and sends the row to review when nothing matches", async () => {
    const calls: CatalogQuery[] = [];
    const search = fakeCatalogSearch(RECORDING_CATALOG, calls);
    const result = await matchRow(row("Not In Catalog", "Nobody Known", 1970), search);

    expect(result).toEqual({ kind: "no_match", candidates: [] });
    expect(calls).toEqual(ladder("Not In Catalog", "Nobody Known"));
  });

  it("keeps searching past a close result and accepts the exact album a later step finds", async () => {
    const reissue = catalogAlbum("reissue", "Fake Album One: Deluxe", "Fake Artist A", 2001);
    const exact = catalogAlbum("exact", "Fake Album One", "Fake Artist A", 2001);
    const calls: CatalogQuery[] = [];
    const search: CatalogSearch = async (query) => {
      calls.push(query);
      return query.kind === "text" ? [reissue] : [reissue, exact];
    };
    const result = await matchRow(row("Fake Album One", "Fake Artist A"), search);

    expect(result).toEqual({ kind: "accepted", album: exact });
    expect(calls).toEqual([text("Fake Album One Fake Artist A"), { kind: "fields", title: "Fake Album One", artist: "Fake Artist A" }]);
  });

  it("searches at most four times when every result is only close", async () => {
    const calls: CatalogQuery[] = [];
    const reissue = catalogAlbum("reissue", "Fake Album One: Deluxe", "Fake Artist A", 2001);
    const result = await matchRow(row("Fake Album One", "Fake Artist A"), fakeSearchOf([reissue], calls));

    expect(calls).toHaveLength(4);
    expect(result).toEqual({ kind: "accepted", album: reissue });
  });

  it("keeps the ladder's results ranked in the review candidates, deduped by catalog id", async () => {
    const calls: CatalogQuery[] = [];
    const search = fakeCatalogSearch(RECORDING_CATALOG, calls);
    // The one album found has the right artist but not the title, so all four steps run and each finds it again.
    const result = await matchRow(row("Salty Dog", "Procol Harum", 1969), search);

    expect(calls).toHaveLength(4);
    expect(result.kind).toBe("no_match");
    if (result.kind !== "no_match") return;
    const ids = result.candidates.map((c) => c.catalogId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(["procol-salty"]);
  });

  describe("with fixtures from the recorded sessions", () => {
    const cases: {
      name: string;
      row: [title: string, artist: string, year: number];
      accepted: string;
      calls: CatalogQuery[];
    }[] = [
      {
        name: "an extra artist word (Trio) is found by the fields search, then the rest of the ladder runs",
        row: ["Portraits in Jazz", "Bill Evans Trio", 1960],
        accepted: "evans-portrait",
        calls: ladder("Portraits in Jazz", "Bill Evans Trio"),
      },
      {
        name: "a typo in the title is found by the fields search, then the rest of the ladder runs",
        row: ["Meet the Tempations", "The Temptations", 1964],
        accepted: "temps-meet",
        calls: ladder("Meet the Tempations", "The Temptations"),
      },
      {
        name: "a title equal to the artist is decided by the year, on the first search",
        row: ["Procol Harum", "Procol Harum", 1967],
        accepted: "procol-debut",
        calls: [text("Procol Harum Procol Harum")],
      },
      {
        name: "punctuation and accents are close, so the ladder runs on, and the album is still found",
        row: ["Getz/Gilberto", "Stan Getz & Joao Gilberto", 1964],
        accepted: "getz-gilberto",
        calls: ladder("Getz/Gilberto", "Stan Getz & Joao Gilberto"),
      },
    ];
    it.each(cases)("$name", async ({ row: [title, artist, year], accepted, calls: expected }) => {
      const calls: CatalogQuery[] = [];
      const result = await matchRow(row(title, artist, year), fakeCatalogSearch(RECORDING_CATALOG, calls));

      expect(result.kind).toBe("accepted");
      if (result.kind === "accepted") expect(result.album.catalogId).toBe(accepted);
      expect(calls).toEqual(expected);
    });

    it.each([
      { name: "a close artist", row: ["Portraits in Jazz", "Bill Evans Trio", 1975] as const, top: "evans-portrait" },
      { name: "a close title", row: ["Meet the Tempations", "The Temptations", 1990] as const, top: "temps-meet" },
    ])("sends $name with the catalog year off to review, that album first", async ({ row: [title, artist, year], top }) => {
      const result = await matchRow(row(title, artist, year), fakeCatalogSearch(RECORDING_CATALOG));
      expect(result.kind).toBe("no_match");
      if (result.kind === "no_match") expect(result.candidates[0].catalogId).toBe(top);
    });

    it("sends a doubtful row to review", async () => {
      // "Bill Frisell" shares only "Bill" with "Bill Evans", so no step finds a usable result.
      const result = await matchRow(row("Portraits in Jazz", "Bill Frisell", 1960), fakeCatalogSearch(RECORDING_CATALOG));
      expect(result.kind).toBe("no_match");
    });
  });
});

describe("searchForReview", () => {
  const key = { title: "Portraits in Jazz", artist: "Bill Evans Trio", year: 1960 };

  it("runs the whole ladder for the default text when no result is exact", async () => {
    const calls: CatalogQuery[] = [];
    const results = await searchForReview(key, defaultSearchText(key), true, fakeCatalogSearch(RECORDING_CATALOG, calls));

    expect(calls.map((call) => call.kind)).toEqual(["text", "fields", "fields", "fields"]);
    expect(results.map((album) => album.catalogId)).toEqual(["evans-portrait"]);
  });

  it("searches typed text as text and ranks the results against the row", async () => {
    const calls: CatalogQuery[] = [];
    const results = await searchForReview(key, "bill evans", false, fakeCatalogSearch(RECORDING_CATALOG, calls));

    expect(calls).toEqual([{ kind: "text", text: "bill evans" }]);
    expect(results.map((album) => album.catalogId)).toEqual(["evans-portrait", "evans-explorations"]);
  });

  it("retries typed text that finds nothing as a title", async () => {
    const calls: CatalogQuery[] = [];
    const results = await searchForReview(key, "Portrats in Jazz", false, fakeCatalogSearch(RECORDING_CATALOG, calls));

    expect(calls).toEqual([
      { kind: "text", text: "Portrats in Jazz" },
      { kind: "fields", title: "Portrats in Jazz" },
    ]);
    expect(results.map((album) => album.catalogId)).toEqual(["evans-portrait"]);
  });
});
