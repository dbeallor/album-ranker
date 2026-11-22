import type { DatabaseSync } from "node:sqlite";
import { DataError, type MatchupResult } from "./db/types";
import { countMatchups, recordMatchup, undoLastMatchup } from "./db/matchups";
import { pairKey } from "./elo/pick";
import type { RankingProgress } from "./elo/progress";
import { loadAlbumCard, loadMatchupState, loadRatings, progressOf, type AlbumCard } from "./ratings";

export type MatchupView = {
  pair: { a: AlbumCard; b: AlbumCard } | null;
  /** Every matchup ever stored, not only this session's. */
  count: number;
  lastAnswer: { text: string } | null;
  canUndo: boolean;
  /** How far the library is from an approximately right order; null with fewer than two albums. */
  progress: RankingProgress | null;
};

export type MatchupActionResult = MatchupView | { error: string };

const RESULTS: MatchupResult[] = ["a", "b", "tie"];
const PAIR_KEY = /^\d+-\d+$/;
const MAX_AVOID = 100_000;

function isId(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0;
}

/** Keeps only well-formed pair keys, since the browser can send anything. */
function parseAvoid(avoid: unknown): Set<string> {
  if (!Array.isArray(avoid)) return new Set();
  return new Set(avoid.slice(0, MAX_AVOID).filter((key): key is string => typeof key === "string" && PAIR_KEY.test(key)));
}

function view(db: DatabaseSync, avoid: Set<string>, random: () => number, lastAnswer: MatchupView["lastAnswer"]): MatchupView {
  const { pair, count, progress } = loadMatchupState(db, avoid, random);
  return { pair, count, lastAnswer, canUndo: count > 0, progress };
}

function round(rating: number): number {
  return Math.round(rating);
}

/** "Title 1500 → 1516, Other 1500 → 1484", or null when either album has no rating on one side. */
function changeText(
  before: Map<number, number>,
  after: Map<number, number>,
  albums: { id: number; title: string }[],
  prefix = "",
): string | null {
  const parts: string[] = [];
  for (const { id, title } of albums) {
    const was = before.get(id);
    const now = after.get(id);
    if (was === undefined || now === undefined) return null;
    parts.push(`${title} ${round(was)} → ${round(now)}`);
  }
  return prefix + parts.join(", ");
}

export function answerMatchup(
  db: DatabaseSync,
  albumAId: unknown,
  albumBId: unknown,
  result: unknown,
  avoid: unknown,
  random: () => number = Math.random,
): MatchupActionResult {
  if (!isId(albumAId) || !isId(albumBId) || albumAId === albumBId || !RESULTS.includes(result as MatchupResult)) {
    return { error: "That answer wasn't valid. Try again." };
  }
  const before = loadRatings(db).ratings;
  if (!before.has(albumAId) || !before.has(albumBId)) {
    return { error: "Those two albums can't be compared. Skip them or reload the page." };
  }

  try {
    recordMatchup(db, { albumAId, albumBId, result: result as MatchupResult });
  } catch (error) {
    if (error instanceof DataError) return { error: error.message };
    throw error;
  }

  const after = loadRatings(db).ratings;
  const a = loadAlbumCard(db, albumAId)!;
  const b = loadAlbumCard(db, albumBId)!;
  return view(db, parseAvoid(avoid), random, { text: changeText(before, after, [a, b])! });
}

/** Records nothing. The skipped pair is avoided from now on, so the next pair is a different one. */
export function skipMatchup(
  db: DatabaseSync,
  albumAId: unknown,
  albumBId: unknown,
  avoid: unknown,
  random: () => number = Math.random,
): MatchupActionResult {
  if (!isId(albumAId) || !isId(albumBId) || albumAId === albumBId) {
    return { error: "That pair wasn't valid. Reload the page." };
  }
  const avoided = parseAvoid(avoid).add(pairKey(albumAId, albumBId));
  return view(db, avoided, random, null);
}

/** Deletes the newest matchup and serves its pair again, so the user can answer it differently. */
export function undoMatchup(db: DatabaseSync, avoid: unknown, random: () => number = Math.random): MatchupActionResult {
  const before = loadRatings(db).ratings;
  const undone = undoLastMatchup(db);
  if (!undone) return { error: "There is nothing to undo." };

  const afterState = loadRatings(db);
  const after = afterState.ratings;
  const a = loadAlbumCard(db, undone.albumAId);
  const b = loadAlbumCard(db, undone.albumBId);
  const text = a && b ? changeText(before, after, [a, b], "Undone: ") : null;
  const lastAnswer = { text: text ?? "Undone." };

  if (a && b && after.has(a.id) && after.has(b.id)) {
    const count = countMatchups(db);
    return { pair: { a, b }, count, lastAnswer, canUndo: count > 0, progress: progressOf(afterState) };
  }
  // One of the albums has lost its placement since, so the pair can't be asked again.
  return view(db, parseAvoid(avoid), random, lastAnswer);
}
