import { join } from "node:path";
import type { CatalogAlbum, CatalogQuery } from "../catalog/types.ts";
import { editDistance } from "./grade.ts";
import { normalizeText } from "./normalize.ts";
import type { CatalogSearch, ImportRow, RawRow } from "./types.ts";

/** A made-up catalog album. `id` becomes the catalog id, `artistId` the artist credit's id. */
export function catalogAlbum(
  id: string,
  title: string,
  artist: string,
  year: number | null,
  artistId: string | null = `artist-${artist}`,
): CatalogAlbum {
  return { catalogId: id, title, artist, artistId, year, coverUrl: `https://covers.test/${id}` };
}

export function rawRow(over: Partial<RawRow> = {}): RawRow {
  return {
    rowNumber: 2,
    album: "Fake Album One",
    artist: "Fake Artist A",
    year: 2001,
    rank: null,
    honorableMention: null,
    decadeRank: null,
    ...over,
  };
}

export function importRow(over: Partial<ImportRow> = {}): ImportRow {
  return {
    rowNumber: 2,
    key: { title: "Fake Album One", artist: "Fake Artist A", year: 2001 },
    placement: "listed",
    rank: null,
    decadeRank: null,
    conflictingPlacement: null,
    droppedDecadeRank: null,
    ...over,
  };
}

/** The catalog of made-up albums the fixture spreadsheet's rows match against. */
export const FIXTURE_CATALOG: CatalogAlbum[] = [
  catalogAlbum("cat-one", "Fake Album One", "Fake Artist A", 2001, "art-a"),
  catalogAlbum("cat-two", "Fake Album Two", "Fake Artist A", 2001, "art-a"),
  catalogAlbum("cat-three", "Fake Album Three", "Fake Artist B", 2001, "art-b"),
  catalogAlbum("cat-four", "Fake Album Four", "Fake Artist C", 2001, "art-c"),
  catalogAlbum("cat-five", "Fake Album Five", "Fake Artist D", 2001, "art-d"),
  catalogAlbum("cat-six", "Fake Album Six", "Fake Artist E", 2002, "art-e"),
  catalogAlbum("cat-seven", "Fake Album Seven", "Fake Artist F", 2002, "art-f"),
  catalogAlbum("cat-nine", "Fake Album Nine", "Fake Artist H", 2002, "art-h"),
  catalogAlbum("cat-ten", "Fake Album Ten", "Fake Artist I", 2002, "art-i"),
  catalogAlbum("cat-eleven", "Fake Album Eleven", "Fake Artist J", 2003, "art-j"),
  catalogAlbum("cat-thirteen-a", "Fake Album Thirteen", "Fake Artist L", 1990, "art-l"),
  catalogAlbum("cat-thirteen-b", "Fake Album Thirteen", "Fake Artist L", 2010, "art-l"),
  catalogAlbum("cat-fourteen", "Fake Album Fourteen", "Fake Artist M", 2004, "art-m"),
  catalogAlbum("cat-seventeen", "Fake Album Seventeen", "Fake Artist N & Fake Artist O", 2004, "art-n+art-o"),
];

/** The committed fixture spreadsheet of made-up rows (see fixtures/make-fixture.ts). */
export const FIXTURE = join(import.meta.dirname, "fixtures", "albums.xlsx");

/** Albums from the recorded review sessions, plus neighbours a real catalog would return alongside them. */
export const RECORDING_CATALOG: CatalogAlbum[] = [
  catalogAlbum("evans-portrait", "Portraits in Jazz", "Bill Evans", 1960, "art-evans"),
  catalogAlbum("evans-explorations", "Explorations", "Bill Evans", 1961, "art-evans"),
  catalogAlbum("temps-meet", "Meet the Temptations", "The Temptations", 1964, "art-temps"),
  catalogAlbum("temps-smokey", "The Temptations Sing Smokey", "The Temptations", 1965, "art-temps"),
  catalogAlbum("beatles-meet", "Meet the Beatles!", "The Beatles", 1964, "art-beatles"),
  catalogAlbum("procol-debut", "Procol Harum", "Procol Harum", 1967, "art-procol"),
  catalogAlbum("procol-remake", "Procol Harum", "Procol Harum", 2003, "art-procol"),
  catalogAlbum("procol-salty", "A Salty Dog", "Procol Harum", 1969, "art-procol"),
  catalogAlbum(
    "getz-gilberto",
    "Getz / Gilberto",
    "Stan Getz / João Gilberto featuring Antônio Carlos Jobim",
    1964,
    "art-getz+art-gilberto+art-jobim",
  ),
  catalogAlbum("getz-au-go-go", "Getz au Go Go", "Stan Getz & João Gilberto", 1964, "art-getz+art-gilberto"),
];

function searchWords(text: string): string[] {
  // Like the real query: "/" splits a word and words with no letter or digit are dropped.
  return text
    .replace(/\//g, " ")
    .split(/\s+/)
    .filter((word) => /[\p{L}\p{N}]/u.test(word))
    .map(normalizeText)
    .flatMap((word) => word.split(" "))
    .filter((word) => word !== "");
}

/** Whether `word` is one of the words of `field`; `fuzzy` lets a word of 5 or more letters be one edit off. */
function hasWord(field: string, word: string, fuzzy: boolean): boolean {
  return searchWords(field).some(
    (candidate) => candidate === word || (fuzzy && word.length >= 5 && candidate.length >= 5 && editDistance(candidate, word) <= 1),
  );
}

/**
 * A fake catalog search over `catalog`, answering `text` and `fields` queries as the real catalog does. A text query
 * needs every word in the title or the artist; a fields query needs every title word in the title and some artist
 * word in the artist, with one typo allowed on words of 5 or more letters. Each query is pushed onto `calls`.
 */
export function fakeCatalogSearch(catalog: CatalogAlbum[], calls: CatalogQuery[] = []): CatalogSearch {
  return async (query) => {
    calls.push(query);
    if (query.kind === "text") {
      const words = searchWords(query.text);
      if (words.length === 0) return [];
      return catalog.filter((album) =>
        words.every((word) => hasWord(album.title, word, false) || hasWord(album.artist, word, false)),
      );
    }
    const titleWords = searchWords(query.title ?? "");
    const artistWords = searchWords(query.artist ?? "");
    if (titleWords.length === 0 && artistWords.length === 0) return [];
    return catalog.filter(
      (album) =>
        titleWords.every((word) => hasWord(album.title, word, true)) &&
        (artistWords.length === 0 || artistWords.some((word) => hasWord(album.artist, word, true))),
    );
  };
}
