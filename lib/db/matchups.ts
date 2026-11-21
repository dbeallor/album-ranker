import type { DatabaseSync } from "node:sqlite";
import { now, transaction } from "./transaction.ts";
import { DataError, type Matchup, type MatchupResult } from "./types.ts";

type Row = Record<string, unknown>;

const RESULTS: MatchupResult[] = ["a", "b", "tie"];
const REPLAY_ORDER = "ORDER BY created_at, id";

function toMatchup(row: Row): Matchup {
  return {
    id: row.id as number,
    albumAId: row.album_a_id as number,
    albumBId: row.album_b_id as number,
    result: row.result as MatchupResult,
    createdAt: row.created_at as string,
  };
}

export type RecordMatchupInput = {
  albumAId: number;
  albumBId: number;
  result: MatchupResult;
  /** Defaults to now. Mainly for tests and imports. */
  createdAt?: string;
};

export function recordMatchup(db: DatabaseSync, input: RecordMatchupInput): Matchup {
  if (input.albumAId === input.albumBId) {
    throw new DataError("invalid_input", "A matchup needs two different albums.");
  }
  if (!RESULTS.includes(input.result)) {
    throw new DataError("invalid_input", `Unknown matchup result ${String(input.result)}.`);
  }
  for (const albumId of [input.albumAId, input.albumBId]) {
    if (!db.prepare("SELECT 1 FROM albums WHERE id = ?").get(albumId)) {
      throw new DataError("not_found", `Album ${albumId} does not exist.`);
    }
  }
  const { lastInsertRowid } = db
    .prepare("INSERT INTO matchups (album_a_id, album_b_id, result, created_at) VALUES (?, ?, ?, ?)")
    .run(input.albumAId, input.albumBId, input.result, input.createdAt ?? now());
  return toMatchup(db.prepare("SELECT * FROM matchups WHERE id = ?").get(Number(lastInsertRowid))!);
}

/** All matchups in replay order: created at, then id. */
export function listMatchups(db: DatabaseSync): Matchup[] {
  return db.prepare(`SELECT * FROM matchups ${REPLAY_ORDER}`).all().map(toMatchup);
}

export function countMatchups(db: DatabaseSync): number {
  return Number(db.prepare("SELECT COUNT(*) AS n FROM matchups").get()!.n);
}

/** Deletes and returns the newest matchup (created at, then id), or returns undefined if there are none. */
export function undoLastMatchup(db: DatabaseSync): Matchup | undefined {
  return transaction(db, () => {
    const row = db.prepare("SELECT * FROM matchups ORDER BY created_at DESC, id DESC LIMIT 1").get();
    if (!row) return undefined;
    db.prepare("DELETE FROM matchups WHERE id = ?").run(row.id);
    return toMatchup(row);
  });
}
