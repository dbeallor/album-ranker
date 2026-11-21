import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { createAlbum } from "./db/albums";
import { getDecadeList, listDecadeLists } from "./db/decade-lists";
import { memoryDb, seedAlbums } from "./db/test-db";
import { addYearEntry } from "./db/year-entries";
import {
  acceptSuggestion,
  loadDecadePicker,
  loadDecadeView,
  saveDecadeList,
  type DecadeActionResult,
  type DecadeView,
} from "./decade-service";

function asView(result: DecadeActionResult): DecadeView {
  if ("error" in result) throw new Error(result.error);
  return result;
}

function listIds(db: DatabaseSync, decade: number): number[] {
  return getDecadeList(db, decade).map((entry) => entry.albumId);
}

describe("decade service", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = memoryDb();
  });

  /** `count` honorable mention albums spread over 1990 to 1999. Returns their ids. */
  function seedNineties(count: number): number[] {
    const ids = seedAlbums(db, count);
    ids.forEach((albumId, i) => {
      addYearEntry(db, { albumId, year: 1990 + (i % 10), placement: "honorable_mention" });
    });
    return ids;
  }

  it("saving an order and loading it again returns that order", () => {
    const ids = seedNineties(4);
    const wanted = [ids[2], ids[0], ids[3]];

    const saved = asView(saveDecadeList(db, 1990, wanted));
    expect(saved.list.map((row) => row.albumId)).toEqual(wanted);

    const reloaded = loadDecadeView(db, 1990);
    expect(reloaded.list.map((row) => row.albumId)).toEqual(wanted);
    expect(reloaded.panel.map((row) => row.albumId)).toEqual([ids[1]]);
    expect(reloaded.suggestion).toBeNull();
  });

  it("refuses a 26th album and leaves the list unchanged", () => {
    const ids = seedNineties(26);
    saveDecadeList(db, 1990, ids.slice(0, 25));

    const result = saveDecadeList(db, 1990, ids);
    expect(result).toEqual({ error: "A decade list holds at most 25 albums." });
    expect(listIds(db, 1990)).toEqual(ids.slice(0, 25));
  });

  it("refuses an album from another decade and a listed album", () => {
    const ids = seedAlbums(db, 3);
    addYearEntry(db, { albumId: ids[0], year: 1990, placement: "honorable_mention" });
    addYearEntry(db, { albumId: ids[1], year: 1985, placement: "honorable_mention" });
    addYearEntry(db, { albumId: ids[2], year: 1991, placement: "listed" });
    saveDecadeList(db, 1990, [ids[0]]);

    expect("error" in saveDecadeList(db, 1990, [ids[0], ids[1]])).toBe(true);
    expect("error" in saveDecadeList(db, 1990, [ids[0], ids[2]])).toBe(true);
    expect(listIds(db, 1990)).toEqual([ids[0]]);
  });

  it("a decade with fewer than 25 eligible albums suggests and offers what it has", () => {
    const ids = seedNineties(3);

    const view = loadDecadeView(db, 1990);
    expect(view.suggestion!.map((row) => row.albumId)).toEqual(ids);
    expect(view.panel.map((row) => row.albumId)).toEqual(ids);
    expect(view.eligibleCount).toBe(3);
  });

  it("a decade with no list returns the suggestion and stores nothing", () => {
    seedNineties(3);

    const view = loadDecadeView(db, 1990);
    expect(view.list).toEqual([]);
    expect(view.suggestion).toHaveLength(3);
    expect(listDecadeLists(db)).toEqual([]);
  });

  it("accept saves the suggestion in order", () => {
    seedNineties(3);
    const suggestion = loadDecadeView(db, 1990).suggestion!.map((row) => row.albumId);

    const view = asView(acceptSuggestion(db, 1990, suggestion));
    expect(view.list.map((row) => row.albumId)).toEqual(suggestion);
    expect(view.suggestion).toBeNull();
    expect(listIds(db, 1990)).toEqual(suggestion);
  });

  it("accept on a decade that already has a list stores nothing and returns the current list", () => {
    const ids = seedNineties(3);
    saveDecadeList(db, 1990, [ids[2]]);

    const result = acceptSuggestion(db, 1990, ids);
    expect(result).toMatchObject({ error: "This decade already has a list." });
    expect((result as { view: DecadeView }).view.list.map((row) => row.albumId)).toEqual([ids[2]]);
    expect(listIds(db, 1990)).toEqual([ids[2]]);
  });

  it("shows the year page year, not the release year", () => {
    const album = createAlbum(db, { title: "Late", artist: { name: "A" }, releaseYear: 1989 });
    addYearEntry(db, { albumId: album.id, year: 1991, placement: "honorable_mention" });

    expect(loadDecadeView(db, 1990).panel[0].year).toBe(1991);
    expect(loadDecadeView(db, 1980).panel).toEqual([]);
  });

  it("refuses a decade that is not a multiple of 10, a non-integer id and a duplicate id", () => {
    const ids = seedNineties(2);

    expect("error" in saveDecadeList(db, 1995, ids)).toBe(true);
    expect("error" in saveDecadeList(db, 1990, [ids[0], 1.5])).toBe(true);
    expect("error" in saveDecadeList(db, 1990, [ids[0], ids[0]])).toBe(true);
    expect("error" in acceptSuggestion(db, 1995, ids)).toBe(true);
    expect(listDecadeLists(db)).toEqual([]);
  });

  it("the picker lists each decade with albums, oldest first, with list and eligible counts", () => {
    const ids = seedNineties(2);
    const [old] = seedAlbums(db, 1);
    addYearEntry(db, { albumId: old, year: 1985, placement: "listed" });
    saveDecadeList(db, 1990, [ids[0]]);

    expect(loadDecadePicker(db)).toEqual([
      { decade: 1980, listCount: 0, eligibleCount: 0 },
      { decade: 1990, listCount: 1, eligibleCount: 2 },
    ]);
  });
});
