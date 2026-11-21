// Writes albums.xlsx next to this file: a small spreadsheet of made-up rows in the shape of the real one
// (an Albums sheet with two Rank columns and formula columns, plus a sheet the import must ignore).
// Run it with `npm run import:fixture` after changing the rows below, and commit the result.
import writeExcelFile from "write-excel-file/node";

type Cell = { value: string | number; type?: "Formula" } | null;

const HEADER = [
  "Rank", // derived label in the real sheet; the import must not read it
  "Album",
  "Artist",
  "Year",
  "Rank", // the input rank
  "Honorable Mention",
  "Decade Top 25 Rank",
  "Decade",
  "Points",
];

// album, artist, year, rank, honorable mention, decade rank
type Row = [string | null, string | null, number | null, number | null, number | null, number | null];

const ROWS: Row[] = [
  ["Fake Album One", "Fake Artist A", 2001, 1, null, 3], // ranked, decade rank 3
  ["Fake Album Two", "Fake Artist A", 2001, 2, null, 1], // same artist as One, decade rank 1
  ["Fake Album Three", "Fake Artist B", 2001, null, 1, null], // honorable mention
  ["Fake Album Four", "Fake Artist C", 2001, null, null, null], // listed
  ["Fake Album Five", "Fake Artist D", 2001, 3, 1, 2], // rank and honorable mention, decade rank 2
  [null, null, null, null, null, null], // blank row
  ["Fake Album Four", "Fake Artist C", 2001, null, null, null], // exact duplicate of Four
  ["Fake Album Six", "Fake Artist E", 2002, null, null, null], // listed
  ["fake album six", "FAKE ARTIST E", 2002, null, 1, null], // case-only duplicate with another placement
  ["Fake Albm Seven", "Fake Artist F", 2002, 4, null, null], // typo in the title
  ["Fake Album Nine", "Fake Artist H", 2002, 2, null, null], // ranked 2
  ["Fake Album Ten", "Fake Artist I", 2002, 2, null, null], // repeats rank 2 in 2002
  ["Fake Album Eleven", "Fake Artist J", 2003, null, null, 5], // decade rank on a listed row
  ["Fake Album Twelve", "Fake Artist K", 1850, 1, null, null], // invalid year
  ["Fake Album Thirteen", "Fake Artist L", 2003, 1, null, null], // two catalog albums with this title
  ["Fake Album Fourteen", "Fake Artist M", 2004, null, null, null], // listed
  ["Fake Album Fourteen", "Fake Artist M", 2005, null, 1, null], // same catalog album, another year
  ["The Fake Album Seventeen (Remastered)", "Fake Artist N & Fake Artist O", 2004, 1, null, null], // normalizing
  ["Fake Album Eighteen", null, 2004, null, null, null], // missing artist
];

function cell(value: string | number | null): Cell {
  return value === null ? null : { value };
}

const albums: Cell[][] = [
  HEADER.map((value) => ({ value })),
  ...ROWS.map((row, index) => {
    const line = index + 2;
    return [
      { value: 99 },
      cell(row[0]),
      cell(row[1]),
      cell(row[2]),
      cell(row[3]),
      cell(row[4]),
      cell(row[5]),
      row[0] === null ? null : { value: `=INT(D${line}/10)*10`, type: "Formula" },
      row[0] === null ? null : { value: `=IF(E${line}="",0,11-E${line})`, type: "Formula" },
    ] satisfies Cell[];
  }),
];
// A blank row has no cells at all, not even the filler columns.
albums[1 + ROWS.findIndex((row) => row[0] === null)] = [];

const notes: Cell[][] = [[{ value: "Artist" }, { value: "Fake Artist A" }]];

await writeExcelFile([
  { data: albums, sheet: "Albums" },
  { data: notes, sheet: "Artists" },
]).toFile(new URL("./albums.xlsx", import.meta.url).pathname);
