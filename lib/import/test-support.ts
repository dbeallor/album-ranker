import { join } from "node:path";
import type { CatalogAlbum } from "../catalog/types.ts";
import type { ImportRow, RawRow } from "./types.ts";

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
