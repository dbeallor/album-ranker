import { describe, expect, it } from "vitest";
import { isBlankRow, isHonorableMention, mapRow, prepareRows } from "./rows.ts";
import { rawRow } from "./test-support.ts";

describe("mapRow placement", () => {
  const cases = [
    { name: "ranked", raw: { rank: 4 }, placement: "ranked", rank: 4, decadeRank: null },
    { name: "ranked with a decade rank", raw: { rank: 4, decadeRank: 7 }, placement: "ranked", rank: 4, decadeRank: 7 },
    { name: "honorable mention", raw: { honorableMention: 1 }, placement: "honorable_mention", rank: null, decadeRank: null },
    { name: "honorable mention with a decade rank", raw: { honorableMention: 1, decadeRank: 25 }, placement: "honorable_mention", rank: null, decadeRank: 25 },
    { name: "listed", raw: {}, placement: "listed", rank: null, decadeRank: null },
    { name: "rank 10", raw: { rank: 10 }, placement: "ranked", rank: 10, decadeRank: null },
    { name: "numbers written as text", raw: { year: "2001", rank: "3", decadeRank: "9" }, placement: "ranked", rank: 3, decadeRank: 9 },
  ];
  it.each(cases)("maps $name", ({ raw, placement, rank, decadeRank }) => {
    const result = mapRow(rawRow(raw));
    expect(result).toMatchObject({ ok: true, row: { placement, rank, decadeRank } });
  });

  it("trims the key and keeps it as written", () => {
    const result = mapRow(rawRow({ album: "  Fake Album One ", artist: " Fake Artist A  ", year: 2001 }));
    expect(result).toMatchObject({ ok: true, row: { key: { title: "Fake Album One", artist: "Fake Artist A", year: 2001 } } });
  });

  it("lets the honorable mention flag win over a rank, and says so", () => {
    const result = mapRow(rawRow({ rank: 5, honorableMention: 1, decadeRank: 2 }));
    expect(result).toMatchObject({
      ok: true,
      row: {
        placement: "honorable_mention",
        rank: null,
        decadeRank: 2,
        conflictingPlacement: { droppedRank: 5 },
        droppedDecadeRank: null,
      },
    });
  });

  it("drops a decade rank on a listed row and says so", () => {
    const result = mapRow(rawRow({ decadeRank: 5 }));
    expect(result).toMatchObject({
      ok: true,
      row: { placement: "listed", decadeRank: null, droppedDecadeRank: "decade rank 5 on a listed album", conflictingPlacement: null },
    });
  });
});

describe("mapRow invalid decade rank", () => {
  const cases = [
    { name: "0", raw: { decadeRank: 0 }, reason: "decade rank 0 is outside 1 to 25" },
    { name: "26", raw: { decadeRank: 26 }, reason: "decade rank 26 is outside 1 to 25" },
    { name: "0.25", raw: { decadeRank: 0.25 }, reason: 'decade rank "0.25" is not a whole number' },
    { name: "text", raw: { decadeRank: "top" }, reason: 'decade rank "top" is not a whole number' },
  ];
  it.each(cases)("keeps the row and drops a decade rank of $name", ({ raw, reason }) => {
    expect(mapRow(rawRow({ rank: 3, ...raw }))).toMatchObject({
      ok: true,
      row: { placement: "ranked", rank: 3, decadeRank: null, droppedDecadeRank: reason },
    });
  });

  it("counts the row as read and does not invalidate it", () => {
    const prepared = prepareRows([rawRow({ decadeRank: 0.25 })]);
    expect(prepared.invalid).toEqual([]);
    expect(prepared.rows).toHaveLength(1);
  });
});

describe("mapRow validation", () => {
  const cases = [
    { name: "a missing album", raw: { album: null }, reason: "missing album" },
    { name: "a whitespace album", raw: { album: "   " }, reason: "missing album" },
    { name: "a missing artist", raw: { artist: undefined }, reason: "missing artist" },
    { name: "a missing year", raw: { year: null }, reason: "missing year" },
    { name: "a year below 1900", raw: { year: 1899 }, reason: "year 1899 is outside 1900 to 2100" },
    { name: "a year above 2100", raw: { year: 2101 }, reason: "year 2101 is outside 1900 to 2100" },
    { name: "a year that is text", raw: { year: "nineteen" }, reason: 'year "nineteen" is not a whole number' },
    { name: "a fractional year", raw: { year: 1999.5 }, reason: 'year "1999.5" is not a whole number' },
    { name: "rank 0", raw: { rank: 0 }, reason: 'rank "0" is outside 1 to 10' },
    { name: "rank 11", raw: { rank: 11 }, reason: 'rank "11" is outside 1 to 10' },
    { name: "a text rank", raw: { rank: "top" }, reason: 'rank "top" is outside 1 to 10' },
    { name: "a fractional rank", raw: { rank: 2.5 }, reason: 'rank "2.5" is outside 1 to 10' },
    { name: "an invalid rank even with the honorable mention flag", raw: { rank: 11, honorableMention: 1 }, reason: 'rank "11" is outside 1 to 10' },
  ];
  it.each(cases)("rejects $name", ({ raw, reason }) => {
    expect(mapRow(rawRow(raw))).toEqual({ ok: false, reason });
  });
});

describe("honorable mention cell", () => {
  const cases: [string, unknown, boolean][] = [
    ["1", 1, true],
    ["2", 2, true],
    ["0", 0, false],
    ["TRUE", true, true],
    ["FALSE", false, false],
    ["text x", "x", true],
    ["text 0", "0", false],
    ["text no", "No", false],
    ["text false", " false ", false],
    ["empty", null, false],
    ["undefined", undefined, false],
    ["empty text", "", false],
  ];
  it.each(cases)("reads %s", (_name, cell, expected) => {
    expect(isHonorableMention(cell)).toBe(expected);
  });
});

describe("blank rows", () => {
  it("is blank when album, artist and year are all empty, whatever the other cells hold", () => {
    expect(isBlankRow(rawRow({ album: null, artist: undefined, year: " ", rank: 3 }))).toBe(true);
    expect(isBlankRow(rawRow({ album: null, artist: undefined, year: 2001 }))).toBe(false);
  });

  it("does not count blank rows as read", () => {
    const prepared = prepareRows([rawRow(), rawRow({ rowNumber: 3, album: null, artist: null, year: null })]);
    expect(prepared.rowsRead).toBe(1);
    expect(prepared.invalid).toEqual([]);
  });
});

describe("prepareRows duplicates", () => {
  const first = rawRow({ rowNumber: 2 });

  it("merges an exact duplicate without a note", () => {
    const prepared = prepareRows([first, rawRow({ rowNumber: 3 })]);
    expect(prepared.rows).toHaveLength(1);
    expect(prepared.merged).toEqual([expect.objectContaining({ keptRowNumber: 2, difference: null })]);
    expect(prepared.merged[0].row.rowNumber).toBe(3);
    expect(prepared.rowsRead).toBe(2);
  });

  it("merges a case-only duplicate", () => {
    const prepared = prepareRows([first, rawRow({ rowNumber: 3, album: "FAKE ALBUM ONE", artist: "fake artist a" })]);
    expect(prepared.rows).toHaveLength(1);
    expect(prepared.merged).toHaveLength(1);
  });

  const differing = [
    { name: "placement", other: { honorableMention: 1 }, note: "rows differ, kept the first (listed), ignored (honorable mention)" },
    { name: "rank", base: { rank: 1 }, other: { rank: 2 }, note: "rows differ, kept the first (rank 1), ignored (rank 2)" },
    { name: "decade rank", base: { honorableMention: 1 }, other: { honorableMention: 1, decadeRank: 3 }, note: "rows differ, kept the first (honorable mention), ignored (honorable mention, decade rank 3)" },
  ];
  it.each(differing)("merges rows that differ in $name, first row wins, with a note", ({ base, other, note }) => {
    const prepared = prepareRows([rawRow({ rowNumber: 2, ...base }), rawRow({ rowNumber: 3, ...other })]);
    expect(prepared.rows).toHaveLength(1);
    expect(prepared.rows[0].rowNumber).toBe(2);
    expect(prepared.merged[0].difference).toBe(note);
  });

  it("does not merge rows of the same album in different years or by different artists", () => {
    const prepared = prepareRows([first, rawRow({ rowNumber: 3, year: 2002 }), rawRow({ rowNumber: 4, artist: "Fake Artist B" })]);
    expect(prepared.rows).toHaveLength(3);
    expect(prepared.merged).toEqual([]);
  });

  it("does not merge an invalid row into a valid one, and names invalid rows", () => {
    const prepared = prepareRows([first, rawRow({ rowNumber: 3, rank: 11 })]);
    expect(prepared.rows).toHaveLength(1);
    expect(prepared.invalid).toEqual([{ rowNumber: 3, album: "Fake Album One", reason: 'rank "11" is outside 1 to 10' }]);
  });
});
