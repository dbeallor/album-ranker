import { describe, expect, it } from "vitest";
import { countMatchups, listMatchups, recordMatchup, undoLastMatchup } from "./matchups";
import { memoryDb, seedAlbums } from "./test-db";

describe("matchups", () => {
  it("records a matchup and reads it back", () => {
    const db = memoryDb();
    const [a, b] = seedAlbums(db, 2);
    const m = recordMatchup(db, { albumAId: a, albumBId: b, result: "tie" });
    expect(m).toMatchObject({ albumAId: a, albumBId: b, result: "tie" });
    expect(listMatchups(db)).toEqual([m]);
    expect(countMatchups(db)).toBe(1);
  });

  it("lists in replay order: created at, then id", () => {
    const db = memoryDb();
    const [a, b] = seedAlbums(db, 2);
    const late = recordMatchup(db, { albumAId: a, albumBId: b, result: "a", createdAt: "2024-01-02T00:00:00.000Z" });
    const early = recordMatchup(db, { albumAId: b, albumBId: a, result: "b", createdAt: "2024-01-01T00:00:00.000Z" });
    const tieFirst = recordMatchup(db, { albumAId: a, albumBId: b, result: "tie", createdAt: "2024-01-01T00:00:00.000Z" });
    expect(listMatchups(db).map((m) => m.id)).toEqual([early.id, tieFirst.id, late.id]);
  });

  it("undo removes only the newest matchup and returns it", () => {
    const db = memoryDb();
    const [a, b] = seedAlbums(db, 2);
    const first = recordMatchup(db, { albumAId: a, albumBId: b, result: "a", createdAt: "2024-01-01T00:00:00.000Z" });
    const second = recordMatchup(db, { albumAId: a, albumBId: b, result: "b", createdAt: "2024-01-01T00:00:00.000Z" });
    expect(undoLastMatchup(db)).toEqual(second);
    expect(listMatchups(db)).toEqual([first]);
  });

  it("undo on an empty table returns nothing", () => {
    expect(undoLastMatchup(memoryDb())).toBeUndefined();
  });
});
