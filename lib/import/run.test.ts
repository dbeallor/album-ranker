// @vitest-environment node
import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { CatalogError } from "../catalog/musicbrainz.ts";
import type { CatalogAlbum } from "../catalog/types.ts";
import { createAlbum, listAlbums } from "../db/albums.ts";
import { listImportReviewItems, skipImportReviewItem } from "../db/import-review.ts";
import { listLibrary } from "../db/library.ts";
import { memoryDb } from "../db/test-db.ts";
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
    library: listLibrary(db).map(strip),
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
      imported: 11,
      review: { no_match: 1, ambiguous: 1, duplicate_album: 1, rank_taken: 0 },
      alreadyImported: 0,
      notReached: 0,
      aborted: false,
      openReviewItems: 3,
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
    expect(search).toHaveBeenCalledTimes(14);
  });

  it("adds every matched row to the library under the sheet's year, whatever its rank, and shares artists", async () => {
    const db = memoryDb();
    await importFixture(db);

    const albums = new Map(listAlbums(db).map((album) => [album.id, album]));
    const entries = listLibrary(db).map((entry) => `${entry.year} ${albums.get(entry.albumId)!.title}`);
    expect(entries.sort()).toEqual([
      "2001 Fake Album Five",
      "2001 Fake Album Four",
      "2001 Fake Album One",
      "2001 Fake Album Three",
      "2001 Fake Album Two",
      "2002 Fake Album Nine",
      "2002 Fake Album Six",
      "2002 Fake Album Ten",
      "2003 Fake Album Eleven",
      "2004 Fake Album Fourteen",
      "2004 Fake Album Seventeen",
    ]);
    const byTitle = new Map([...albums.values()].map((a) => [a.title, a]));
    // One and Two share their artist; the collaboration is one artist.
    expect(byTitle.get("Fake Album One")!.artist.id).toBe(byTitle.get("Fake Album Two")!.artist.id);
    expect(new Set(albums.values().map((a) => a.artist.id)).size).toBe(10);
    expect(listLibrary(db).every((entry) => entry.source !== null)).toBe(true);
  });

  it("sends the typo, ambiguous and duplicate rows to review with reasons", async () => {
    const db = memoryDb();
    await importFixture(db);
    expect(listImportReviewItems(db).map((item) => [item.source.title, item.source.year, item.reason, item.reasonDetail])).toEqual([
      ["Fake Albm Seven", 2002, "no_match", null],
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
    expect(summary).toMatchObject({ imported: 0, alreadyImported: 14, review: { no_match: 0, ambiguous: 0, duplicate_album: 0, rank_taken: 0 }, openReviewItems: 3 });
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
    expect(listImportReviewItems(db, "open")).toHaveLength(2);
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
        "Imported               11   (matched automatically)",
        "Sent to review         3    (no match 1, ambiguous 1, duplicate album match 1)",
        "Merged duplicates      2    Fake Album Four - Fake Artist C (2001)",
        "                            fake album six - FAKE ARTIST E (2002): rows differ, kept the first (listed), ignored (honorable mention)",
        "Conflicting placement  1    Fake Album Five - Fake Artist D (2001): rank 3 and honorable mention, imported as honorable mention",
        "Already imported       0",
        "Invalid, skipped       2    row 15 Fake Album Twelve: year 1850 is outside 1900 to 2100",
        "                            row 20 Fake Album Eighteen: missing artist",
        "Not reached            0    re-run to retry",
        "Open review items      3    see /import",
      ].join("\n"),
    );
  });
});

describe("album covers", () => {
  const rows = simpleRows(2);
  const catalog = catalogFor(rows);

  async function run(db: DatabaseSync, resolveCover?: RunDeps["resolveCover"]) {
    const { deps } = fakeDeps(catalog, { resolveCover });
    await runImport(db, prepareRows(rows), deps);
    return new Map(listAlbums(db).map((album) => [album.title, album.coverUrl]));
  }

  it.each([
    { name: "stores the resolved cover", resolve: async () => "https://cdn-images.dzcdn.net/c.jpg", expected: "https://cdn-images.dzcdn.net/c.jpg" },
    { name: "stores no cover when none was found", resolve: async () => null, expected: null },
    { name: "keeps the catalog's cover when there is no resolver", resolve: undefined, expected: "https://covers.test/cat-0" },
  ])("$name for an accepted row", async ({ resolve, expected }) => {
    const covers = await run(memoryDb(), resolve);

    expect(covers.get("Fake Album 1")).toBe(expected);
  });

  it("asks for the cover with the catalog id, title and artist, once per row", async () => {
    const resolveCover = vi.fn<NonNullable<RunDeps["resolveCover"]>>(async () => null);
    await run(memoryDb(), resolveCover);

    expect(resolveCover.mock.calls.map(([query]) => query)).toEqual([
      { catalogId: "cat-0", title: "Fake Album 1", artist: "Fake Artist 1" },
      { catalogId: "cat-1", title: "Fake Album 2", artist: "Fake Artist 2" },
    ]);
  });

  it("does not ask for the cover of an album that is stored already, and keeps its cover", async () => {
    const db = memoryDb();
    createAlbum(db, { title: "Fake Album 1", artist: { name: "Fake Artist 1" }, catalogId: "cat-0", coverUrl: "https://coverartarchive.org/stored" });
    const resolveCover = vi.fn<NonNullable<RunDeps["resolveCover"]>>(async () => "https://cdn-images.dzcdn.net/c.jpg");
    const covers = await run(db, resolveCover);

    expect(resolveCover.mock.calls.map(([query]) => query.catalogId)).toEqual(["cat-1"]);
    expect(covers.get("Fake Album 1")).toBe("https://coverartarchive.org/stored");
  });

  it("does not ask for the cover of a row that goes to review", async () => {
    const resolveCover = vi.fn<NonNullable<RunDeps["resolveCover"]>>(async () => null);
    const { deps } = fakeDeps([], { resolveCover });
    await runImport(memoryDb(), prepareRows(rows), deps);

    expect(resolveCover).not.toHaveBeenCalled();
  });
});

describe("catalog errors", () => {
  it("retries after 5 and 15 seconds, then leaves the row untouched and counts it as not reached", async () => {
    const rows = simpleRows(2);
    const catalog = catalogFor(rows);
    const db = memoryDb();
    const { search, sleep, deps } = fakeDeps(catalog);
    search.mockImplementation(async (query) => {
      if (query.startsWith("Fake Album 1 ")) throw new CatalogError("busy", "busy");
      return catalog;
    });

    const summary = await runImport(db, prepareRows(rows), deps);

    expect(RETRY_DELAYS_MS).toEqual([5000, 15000]);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([5000, 15000]);
    expect(search.mock.calls.filter(([q]) => q.startsWith("Fake Album 1 "))).toHaveLength(3);
    expect(summary).toMatchObject({ imported: 1, notReached: 1, aborted: false });
    expect(listLibrary(db).map((entry) => entry.source?.title)).toEqual(["Fake Album 2"]);
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
    search.mockRejectedValueOnce(new CatalogError("unreachable", "timeout"));
    const db = memoryDb();

    const summary = await runImport(db, prepareRows(rows), deps);

    expect(sleep.mock.calls).toEqual([[5000]]);
    expect(summary).toMatchObject({ imported: 1, notReached: 0 });
  });

  it("reports each failed attempt", async () => {
    const rows = simpleRows(1);
    const onCatalogError = vi.fn();
    const { search, deps } = fakeDeps(catalogFor(rows), { onCatalogError });
    search.mockRejectedValue(new CatalogError("busy", "busy"));
    await runImport(memoryDb(), prepareRows(rows), deps);
    expect(onCatalogError).toHaveBeenCalledTimes(3);
  });

  it.each([
    ["an Error", () => new Error("boom")],
    ["a TypeError", () => new TypeError("x is not a function")],
    ["a non-error value", () => "nope"],
  ])("rethrows %s without retrying or counting the row as not reached", async (_name, make) => {
    const thrown = make();
    const rows = simpleRows(2);
    const onCatalogError = vi.fn();
    const { search, sleep, deps } = fakeDeps(catalogFor(rows), { onCatalogError });
    search.mockRejectedValue(thrown);

    await expect(runImport(memoryDb(), prepareRows(rows), deps)).rejects.toBe(thrown);
    expect(search).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(onCatalogError).not.toHaveBeenCalled();
  });

  it("stops after ten failed rows in a row and counts the rest as not reached", async () => {
    const rows = simpleRows(15);
    const { search, sleep, deps } = fakeDeps(catalogFor(rows));
    search.mockRejectedValue(new CatalogError("unreachable", "down"));
    const db = memoryDb();

    const summary = await runImport(db, prepareRows(rows), deps);

    expect(MAX_CONSECUTIVE_FAILURES).toBe(10);
    expect(summary).toMatchObject({ aborted: true, notReached: 15, imported: 0 });
    expect(search).toHaveBeenCalledTimes(30); // 10 rows, 3 tries each
    expect(sleep).toHaveBeenCalledTimes(20);
    expect(formatSummary(summary)).toContain("Stopped early");
    expect(listLibrary(db)).toEqual([]);
  });

  it("does not stop when successes break up the failures", async () => {
    const rows = simpleRows(21);
    const catalog = catalogFor(rows);
    const { search, deps } = fakeDeps(catalog);
    search.mockImplementation(async (query) => {
      const n = Number(/^Fake Album (\d+) /.exec(query)![1]);
      if (n !== 10 && n !== 11 && n !== 21) throw new CatalogError("unreachable", "down");
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
