// @vitest-environment node
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ImportInputError, extractRows, readAlbumsSheet } from "./read-sheet.ts";
import { FIXTURE } from "./test-support.ts";

const HEADER = ["Rank", "Album", "Artist", "Year", "Rank", "Honorable Mention", "Decade Top 25 Rank", "Points"];

describe("reading the fixture spreadsheet", () => {
  it("reads the Albums sheet by header, with the input Rank right of Album and no derived columns", async () => {
    const rows = await readAlbumsSheet(FIXTURE);

    expect(rows).toHaveLength(19);
    expect(rows[0]).toEqual({
      rowNumber: 2,
      album: "Fake Album One",
      artist: "Fake Artist A",
      year: 2001,
      rank: 1, // not the leading derived Rank, which is 99 on every row
      honorableMention: null,
      decadeRank: 3,
    });
    expect(rows.every((row) => row.rank !== 99)).toBe(true);
    expect(rows[2]).toMatchObject({ album: "Fake Album Three", rank: null, honorableMention: 1 });
  });

  it("keeps the blank row as an empty row, numbered by its place in the sheet", async () => {
    const rows = await readAlbumsSheet(FIXTURE);
    expect(rows[5]).toEqual({
      rowNumber: 7,
      album: null,
      artist: null,
      year: null,
      rank: null,
      honorableMention: null,
      decadeRank: null,
    });
  });

  it("fails with a message for a missing file and for a file that is not an .xlsx", async () => {
    await expect(readAlbumsSheet("/nonexistent/albums.xlsx")).rejects.toThrow("File not found: /nonexistent/albums.xlsx");
    await expect(readAlbumsSheet(fileURLToPath(import.meta.url))).rejects.toThrow(/as an \.xlsx file/);
  });
});

describe("finding the sheet and columns", () => {
  const sheet = (name: string, data: unknown[][]) => ({ sheet: name, data });

  const failures = [
    {
      name: "no Albums sheet names the sheets found",
      sheets: [sheet("Other", [HEADER]), sheet("Notes", [])],
      message: 'The file has no sheet named "Albums". Sheets found: "Other", "Notes".',
    },
    ...["Album", "Artist", "Year", "Honorable Mention", "Decade Top 25 Rank"].map((missing) => ({
      name: `a missing ${missing} header`,
      sheets: [sheet("Albums", [HEADER.map((cell) => (cell === missing ? "Renamed" : cell))])],
      message: `The "Albums" sheet has no "${missing}" column in row 1.`,
    })),
    {
      name: "no Rank to the right of Album",
      sheets: [sheet("Albums", [["Rank", "Album", "Artist", "Year", "Honorable Mention", "Decade Top 25 Rank"]])],
      message: 'The "Albums" sheet has no "Rank" column to the right of "Album" in row 1.',
    },
    {
      name: "an empty Albums sheet",
      sheets: [sheet("Albums", [])],
      message: 'The "Albums" sheet has no "Album" column in row 1.',
    },
  ];
  it.each(failures)("fails on $name", ({ sheets, message }) => {
    expect(() => extractRows(sheets)).toThrow(new ImportInputError(message));
  });

  it("matches headers ignoring case and surrounding spaces, in any column order", () => {
    const rows = extractRows([
      sheet("Albums", [
        [" decade top 25 rank", "YEAR", "artist ", "Honorable mention", "Rank", " album", "RANK"],
        [5, 1999, "Fake Artist A", 1, 99, "Fake Album One", 4],
      ]),
    ]);
    expect(rows).toEqual([
      {
        rowNumber: 2,
        album: "Fake Album One",
        artist: "Fake Artist A",
        year: 1999,
        rank: 4,
        honorableMention: 1,
        decadeRank: 5,
      },
    ]);
  });
});
