// @vitest-environment node
import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import type { CatalogAlbum } from "../catalog/types.ts";
import { listAlbums } from "../db/albums.ts";
import { MAX_DECADE_LIST, getDecadeList, listDecadeLists } from "../db/decade-lists.ts";
import { listImportReviewItems, skipImportReviewItem } from "../db/import-review.ts";
import { memoryDb } from "../db/test-db.ts";
import { listAllYearEntries } from "../db/year-entries.ts";
import { readAlbumsSheet } from "./read-sheet.ts";
import { prepareRows } from "./rows.ts";
import { MAX_CONSECUTIVE_FAILURES, PROGRESS_EVERY, RETRY_DELAYS_MS, runImport, type RunDeps } from "./run.ts";
import { formatSummary } from "./summary.ts";
import { FIXTURE, FIXTURE_CATALOG, catalogAlbum, rawRow } from "./test-support.ts";
import type { CatalogSearch, RawRow } from "./types.ts";

function fakeDeps(catalog: CatalogAlbum[], over: Partial<RunDeps> = {}) {
  const search = vi.fn<CatalogSearch>(async () => catalog);
  const sleep = vi.fn<RunDeps["sleep"]>(async () => {});
  return { search, sleep, deps: { search, sleep, ...over } satisfies RunDeps };
}

/** Raw rows for albums that the catalog (built by `catalogFor`) matches exactly. */
function simpleRows(count: number, over: (i: number) => Partial<RawRow> = () => ({})): RawRow[] {
  return Array.from({ length: count }, (_, i) =>
    rawRow({ rowNumber: i + 2, album: `Fake Album ${i + 1}`, artist: `Fake Artist ${i + 1}`, year: 2001, ...over(i) }),
  );
}

function catalogFor(rows: RawRow[]): CatalogAlbum[] {
  return rows.map((row, i) => catalogAlbum(`cat-${i}`, String(row.album), String(row.artist), Number(row.year)));
}

function snapshot(db: DatabaseSync) {
  const strip = <T extends Record<string, unknown>>(item: T) => ({ ...item, createdAt: 0, updatedAt: 0 });
  return JSON.stringify({
    albums: listAlbums(db),
    years: listAllYearEntries(db).map(strip),
    decades: listDecadeLists(db),
    review: listImportReviewItems(db).map(strip),
  });
}

describe("importing the fixture spreadsheet", () => {
  async function importFixture(db: DatabaseSync, catalog = FIXTURE_CATALOG) {
    const prepared = prepareRows(await readAlbumsSheet(FIXTURE));
    const { search, deps } = fakeDeps(catalog);
    const summary = await runImport(db, prepared, deps);
    return { summary, search };
  }

  it("imports each kind of row and reports what happened", async () => {
    const db = memoryDb();
    const { summary, search } = await importFixture(db);

    expect(summary).toMatchObject({
      rowsRead: 18,
      imported: 10,
      review: { no_match: 1, ambiguous: 1, duplicate_album: 1, rank_taken: 1 },
      alreadyImported: 0,
      notReached: 0,
      aborted: false,
      openReviewItems: 4,
      decadeLists: [{ decade: 2000, entries: 3 }],
      decadeListFull: [],
    });
    expect(summary.invalid.map((row) => [row.rowNumber, row.reason])).toEqual([
      [15, "year 1850 is outside 1900 to 2100"],
      [20, "missing artist"],
    ]);
    expect(summary.merged.map((m) => [m.row.rowNumber, m.keptRowNumber, m.difference])).toEqual([
      [8, 5, null],
      [10, 9, "rows differ, kept the first (listed), ignored (honorable mention)"],
    ]);
    expect(summary.conflictingPlacement.map((row) => row.key.title)).toEqual(["Fake Album Five"]);
    expect(summary.droppedDecadeRank.map((row) => [row.key.title, row.droppedDecadeRank])).toEqual([["Fake Album Eleven", 5]]);
    expect(search).toHaveBeenCalledTimes(14);
  });

  it("writes year entries, shared artists and the decade list in sheet order", async () => {
    const db = memoryDb();
    await importFixture(db);

    const byTitle = new Map(listAlbums(db).map((album) => [album.title, album]));
    const placements = listAllYearEntries(db).map((entry) => {
      const album = [...byTitle.values()].find((a) => a.id === entry.albumId)!;
      return `${entry.year} ${album.title} ${entry.placement}${entry.rank === null ? "" : ` ${entry.rank}`}`;
    });
    expect(placements).toEqual([
      "2001 Fake Album One ranked 1",
      "2001 Fake Album Two ranked 2",
      "2001 Fake Album Three honorable_mention",
      "2001 Fake Album Five honorable_mention",
      "2001 Fake Album Four listed",
      "2002 Fake Album Nine ranked 2",
      "2002 Fake Album Six listed",
      "2003 Fake Album Eleven listed",
      "2004 Fake Album Seventeen ranked 1",
      "2004 Fake Album Fourteen listed",
    ]);
    // One and Two share their artist; the collaboration is one artist.
    expect(byTitle.get("Fake Album One")!.artist.id).toBe(byTitle.get("Fake Album Two")!.artist.id);
    expect(new Set(listAlbums(db).map((a) => a.artist.id)).size).toBe(9);
    // Decade ranks in the sheet: Two 1, Five 2, One 3.
    expect(getDecadeList(db, 2000).map((entry) => [...byTitle.values()].find((a) => a.id === entry.albumId)!.title)).toEqual([
      "Fake Album Two",
      "Fake Album Five",
      "Fake Album One",
    ]);
    expect(listAllYearEntries(db).every((entry) => entry.source !== null)).toBe(true);
  });

  it("sends the typo, ambiguous, duplicate and repeated-rank rows to review with reasons", async () => {
    const db = memoryDb();
    await importFixture(db);
    expect(listImportReviewItems(db).map((item) => [item.source.title, item.source.year, item.reason, item.reasonDetail])).toEqual([
      ["Fake Albm Seven", 2002, "no_match", null],
      ["Fake Album Ten", 2002, "rank_taken", "Fake Album Nine - Fake Artist H"],
      ["Fake Album Thirteen", 2003, "ambiguous", null],
      ["Fake Album Fourteen", 2005, "duplicate_album", "2004"],
    ]);
  });

  it("changes nothing and calls the catalog not at all when run again", async () => {
    const db = memoryDb();
    await importFixture(db);
    const before = snapshot(db);

    const { summary, search } = await importFixture(db);

    expect(search).not.toHaveBeenCalled();
    expect(snapshot(db)).toBe(before);
    expect(summary).toMatchObject({ imported: 0, alreadyImported: 14, review: { no_match: 0, ambiguous: 0, duplicate_album: 0, rank_taken: 0 }, openReviewItems: 4 });
    expect(summary.conflictingPlacement).toEqual([]);
  });

  it("keeps a skipped review item skipped when run again", async () => {
    const db = memoryDb();
    await importFixture(db);
    const typo = listImportReviewItems(db).find((item) => item.reason === "no_match")!;
    skipImportReviewItem(db, typo.id);

    const { search } = await importFixture(db);

    expect(search).not.toHaveBeenCalled();
    expect(listImportReviewItems(db, "skipped").map((item) => item.id)).toEqual([typo.id]);
    expect(listImportReviewItems(db, "open")).toHaveLength(3);
  });

  it("processes a row whose key is new when the sheet changed", async () => {
    const db = memoryDb();
    await importFixture(db);
    const prepared = prepareRows([rawRow({ album: "Fake Album Nine", artist: "Fake Artist H", year: 2009 })]);
    const { search, deps } = fakeDeps(FIXTURE_CATALOG);
    const summary = await runImport(db, prepared, deps);
    expect(search).toHaveBeenCalledTimes(1);
    expect(summary.review.duplicate_album).toBe(1); // Nine is on 2002 already
  });

  it("prints the summary the spec describes", async () => {
    const db = memoryDb();
    const { summary } = await importFixture(db);
    expect(formatSummary(summary)).toBe(
      [
        "Rows read              18",
        "Imported               10   (matched automatically)",
        "Sent to review         4    (no match 1, ambiguous 1, duplicate album match 1, rank taken 1)",
        "Merged duplicates      2    Fake Album Four - Fake Artist C (2001)",
        "                            fake album six - FAKE ARTIST E (2002): rows differ, kept the first (listed), ignored (honorable mention)",
        "Conflicting placement  1    Fake Album Five - Fake Artist D (2001): rank 3 and honorable mention, imported as honorable mention",
        "Decade rank dropped    1    Fake Album Eleven - Fake Artist J (2003): decade rank 5 on a listed album",
        "Decade list full       0",
        "Already imported       0",
        "Invalid, skipped       2    row 15 Fake Album Twelve: year 1850 is outside 1900 to 2100",
        "                            row 20 Fake Album Eighteen: missing artist",
        "Not reached            0    re-run to retry",
        "Decade lists                2000s 3 (entries now on each list)",
        "Open review items      4    see /import",
      ].join("\n"),
    );
  });
});

describe("decade lists", () => {
  it("matches the sheet's decade ranks whatever order the rows import in", async () => {
    const ranks = [4, 1, 5, 3, 2];
    const rows = simpleRows(5, (i) => ({ honorableMention: 1, decadeRank: ranks[i], year: 2001 + i }));
    const db = memoryDb();
    const { deps } = fakeDeps(catalogFor(rows));
    await runImport(db, prepareRows(rows), deps);

    const titles = new Map(listAlbums(db).map((album) => [album.id, album.title]));
    expect(getDecadeList(db, 2000).map((entry) => titles.get(entry.albumId))).toEqual([
      "Fake Album 2", // rank 1
      "Fake Album 5", // rank 2
      "Fake Album 4", // rank 3
      "Fake Album 1", // rank 4
      "Fake Album 3", // rank 5
    ]);
  });

  it("leaves a full list alone and names the album that did not fit", async () => {
    const rows = simpleRows(MAX_DECADE_LIST + 1, (i) => ({
      honorableMention: 1,
      decadeRank: Math.min(i + 1, MAX_DECADE_LIST),
      year: 2000 + (i % 10),
    }));
    const db = memoryDb();
    const { deps } = fakeDeps(catalogFor(rows));
    const summary = await runImport(db, prepareRows(rows), deps);

    expect(summary.imported).toBe(MAX_DECADE_LIST + 1);
    expect(getDecadeList(db, 2000)).toHaveLength(MAX_DECADE_LIST);
    expect(summary.decadeListFull.map((row) => row.key.title)).toEqual([`Fake Album ${MAX_DECADE_LIST + 1}`]);
    expect(summary.decadeLists).toEqual([{ decade: 2000, entries: MAX_DECADE_LIST }]);
    expect(formatSummary(summary)).toContain(`Decade list full       1    Fake Album 26 - Fake Artist 26 (2005): not added to the decade list`);
  });
});

describe("catalog errors", () => {
  it("retries after 5 and 15 seconds, then leaves the row untouched and counts it as not reached", async () => {
    const rows = simpleRows(2);
    const catalog = catalogFor(rows);
    const db = memoryDb();
    const { search, sleep, deps } = fakeDeps(catalog);
    search.mockImplementation(async (query) => {
      if (query.startsWith("Fake Album 1 ")) throw new Error("busy");
      return catalog;
    });

    const summary = await runImport(db, prepareRows(rows), deps);

    expect(RETRY_DELAYS_MS).toEqual([5000, 15000]);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([5000, 15000]);
    expect(search.mock.calls.filter(([q]) => q.startsWith("Fake Album 1 "))).toHaveLength(3);
    expect(summary).toMatchObject({ imported: 1, notReached: 1, aborted: false });
    expect(listAllYearEntries(db).map((entry) => entry.source?.title)).toEqual(["Fake Album 2"]);
    expect(listImportReviewItems(db)).toEqual([]);

    // The next run, with the catalog back, picks the row up and skips the one already imported.
    const again = fakeDeps(catalog);
    const second = await runImport(db, prepareRows(rows), again.deps);
    expect(second).toMatchObject({ imported: 1, alreadyImported: 1, notReached: 0 });
    expect(again.search).toHaveBeenCalledTimes(1);
  });

  it("imports the row when a retry succeeds", async () => {
    const rows = simpleRows(1);
    const { search, sleep, deps } = fakeDeps(catalogFor(rows));
    search.mockRejectedValueOnce(new Error("timeout"));
    const db = memoryDb();

    const summary = await runImport(db, prepareRows(rows), deps);

    expect(sleep.mock.calls).toEqual([[5000]]);
    expect(summary).toMatchObject({ imported: 1, notReached: 0 });
  });

  it("reports each failed attempt", async () => {
    const rows = simpleRows(1);
    const onCatalogError = vi.fn();
    const { search, deps } = fakeDeps(catalogFor(rows), { onCatalogError });
    search.mockRejectedValue(new Error("busy"));
    await runImport(memoryDb(), prepareRows(rows), deps);
    expect(onCatalogError).toHaveBeenCalledTimes(3);
  });

  it("stops after ten failed rows in a row and counts the rest as not reached", async () => {
    const rows = simpleRows(15);
    const { search, sleep, deps } = fakeDeps(catalogFor(rows));
    search.mockRejectedValue(new Error("down"));
    const db = memoryDb();

    const summary = await runImport(db, prepareRows(rows), deps);

    expect(MAX_CONSECUTIVE_FAILURES).toBe(10);
    expect(summary).toMatchObject({ aborted: true, notReached: 15, imported: 0 });
    expect(search).toHaveBeenCalledTimes(30); // 10 rows, 3 tries each
    expect(sleep).toHaveBeenCalledTimes(20);
    expect(formatSummary(summary)).toContain("Stopped early");
    expect(listAllYearEntries(db)).toEqual([]);
  });

  it("does not stop when successes break up the failures", async () => {
    const rows = simpleRows(21);
    const catalog = catalogFor(rows);
    const { search, deps } = fakeDeps(catalog);
    search.mockImplementation(async (query) => {
      const n = Number(/^Fake Album (\d+) /.exec(query)![1]);
      if (n !== 10 && n !== 11 && n !== 21) throw new Error("down");
      return catalog;
    });

    const summary = await runImport(memoryDb(), prepareRows(rows), deps);

    expect(summary.aborted).toBe(false);
    expect(summary).toMatchObject({ imported: 3, notReached: 18 });
  });
});

describe("progress", () => {
  it("reports every 25 rows", async () => {
    const rows = simpleRows(60);
    const onProgress = vi.fn();
    const { deps } = fakeDeps(catalogFor(rows), { onProgress });
    await runImport(memoryDb(), prepareRows(rows), deps);
    expect(PROGRESS_EVERY).toBe(25);
    expect(onProgress.mock.calls).toEqual([
      [25, 60],
      [50, 60],
    ]);
  });
});
