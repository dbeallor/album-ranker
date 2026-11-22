import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { countMatchups, listMatchups } from "./db/matchups";
import { addToLibrary } from "./db/library";
import { memoryDb, seedAlbums } from "./db/test-db";
import { answerMatchup, skipMatchup, undoMatchup, type MatchupView } from "./matchups-service";
import { loadMatchupState, loadRatings } from "./ratings";

const random = () => 0;

function asView(result: ReturnType<typeof answerMatchup>): MatchupView {
  if ("error" in result) throw new Error(result.error);
  return result;
}

describe("matchup actions", () => {
  let db: DatabaseSync;
  let ids: number[];

  beforeEach(() => {
    db = memoryDb();
    ids = seedAlbums(db, 6);
    // 0 and 1 in 2000, 2 in 2001, 3 in 2002, 4 in 2003, 5 is not in the library.
    [2000, 2000, 2001, 2002, 2003].forEach((year, i) => addToLibrary(db, { albumId: ids[i], year }));
  });

  it("an answer moves both ratings and counts the matchup", () => {
    const before = loadRatings(db).ratings;
    const next = asView(answerMatchup(db, ids[0], ids[2], "b", [], random));

    const after = loadRatings(db).ratings;
    expect(after.get(ids[0])).toBeLessThan(before.get(ids[0])!);
    expect(after.get(ids[2])).toBeGreaterThan(before.get(ids[2])!);
    expect(next.count).toBe(1);
    expect(next.canUndo).toBe(true);
    expect(next.lastAnswer!.text).toMatch(/^Album 1 \d+ → \d+, Album 3 \d+ → \d+$/);
  });

  it("undo restores the ratings exactly and serves the undone pair again", () => {
    const before = loadRatings(db).ratings;
    answerMatchup(db, ids[0], ids[2], "a", [], random);
    answerMatchup(db, ids[1], ids[3], "tie", [], random);

    const first = asView(undoMatchup(db, [], random));
    expect(first.pair!.a.id).toBe(ids[1]);
    expect(first.pair!.b.id).toBe(ids[3]);
    expect(first.count).toBe(1);

    const second = asView(undoMatchup(db, [], random));
    expect([second.pair!.a.id, second.pair!.b.id]).toEqual([ids[0], ids[2]]);
    expect(second.count).toBe(0);
    expect(second.canUndo).toBe(false);
    expect(second.lastAnswer!.text).toMatch(/^Undone: /);
    expect(loadRatings(db).ratings).toEqual(before);
  });

  it("answers a pair from the same year", () => {
    const next = asView(answerMatchup(db, ids[0], ids[1], "a", [], random));
    expect(next.count).toBe(1);
    expect(listMatchups(db)).toMatchObject([{ albumAId: ids[0], albumBId: ids[1], result: "a" }]);
  });

  it("undo serves a same-year pair again", () => {
    answerMatchup(db, ids[0], ids[1], "tie", [], random);
    const undone = asView(undoMatchup(db, [], random));
    expect([undone.pair!.a.id, undone.pair!.b.id]).toEqual([ids[0], ids[1]]);
    expect(undone.count).toBe(0);
  });

  it("undo with nothing stored is an error", () => {
    expect(undoMatchup(db, [], random)).toEqual({ error: "There is nothing to undo." });
  });

  it("skip stores nothing and serves another pair", () => {
    const first = loadMatchupState(db, new Set(), random).pair!;
    const next = asView(skipMatchup(db, first.a.id, first.b.id, [], random));

    expect(countMatchups(db)).toBe(0);
    expect(next.lastAnswer).toBeNull();
    expect([next.pair!.a.id, next.pair!.b.id].sort()).not.toEqual([first.a.id, first.b.id].sort());
  });

  it.each([
    { name: "an album not in the library", a: 0, b: 5 },
    { name: "an unknown album", a: 0, b: -1 },
    { name: "the same album twice", a: 0, b: 0 },
  ])("refuses $name and stores nothing", ({ a, b }) => {
    const pick = (i: number) => (i < 0 ? 9999 : ids[i]);
    expect(answerMatchup(db, pick(a), pick(b), "a", [], random)).toHaveProperty("error");
    expect(listMatchups(db)).toEqual([]);
  });

  it.each([
    { name: "a non-integer id", a: 1.5, result: "a" },
    { name: "an unknown result", a: 1, result: "draw" },
  ])("refuses $name", ({ a, result }) => {
    expect(answerMatchup(db, a, 2, result, [], random)).toHaveProperty("error");
    expect(countMatchups(db)).toBe(0);
  });

  it("never serves an album outside the library", () => {
    const served = new Set<number>();
    for (const value of [0, 0.3, 0.6, 0.99]) {
      const { pair } = loadMatchupState(db, new Set(), () => value);
      served.add(pair!.a.id).add(pair!.b.id);
    }
    expect(served.has(ids[5])).toBe(false);
  });
});
