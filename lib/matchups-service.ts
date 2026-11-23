import type { DatabaseSync } from "node:sqlite";
import { DataError, type MatchupResult } from "./db/types";
import { countMatchups, listMatchups, recordMatchup, undoLastMatchup } from "./db/matchups";
import { pairKey, pickMatchup } from "./elo/pick";
import type { RankingProgress } from "./elo/progress";
import type { ReplayMatchup } from "./elo/replay";
import { loadAlbumCard, loadMatchupState, loadRatings, progressOf, type AlbumCard } from "./ratings";

export type MatchupView = {
  pair: { a: AlbumCard; b: AlbumCard } | null;
  /** Every matchup ever stored, not only this session's. */
  count: number;
  lastAnswer: { text: string } | null;
  canUndo: boolean;
  /** How far the library is from an approximately right order; null with fewer than two albums. */
  progress: RankingProgress | null;
  /** The `random()` value the next action uses for its pick, so the pair it serves can be predicted. */
  seed: number;
  /** Cover URLs of the pairs the next action can serve (answer a, b or tie, skip, undo), minus the current pair's own. */
  upcoming: string[];
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

/** The injected random, unless the browser sent a usable seed, which makes the pick the predicted one. */
function randomFor(seed: unknown, random: () => number): () => number {
  return typeof seed === "number" && Number.isFinite(seed) && seed >= 0 && seed < 1 ? () => seed : random;
}

type Pair = { a: AlbumCard; b: AlbumCard };

/** The pair `pickMatchup` serves for these ratings, or undefined when none is possible. */
function pickPair(db: DatabaseSync, loaded: ReturnType<typeof loadRatings>, avoid: Set<string>, seed: number): Pair | undefined {
  const albums = [...loaded.ratings].map(([id, rating]) => ({ id, rating }));
  const picked = pickMatchup({ albums, matchups: loaded.used, avoid, random: () => seed });
  const a = picked && loadAlbumCard(db, picked.a);
  const b = picked && loadAlbumCard(db, picked.b);
  return a && b ? { a, b } : undefined;
}

/** A matchup that sorts after every stored one, standing in for the answer the user is about to give. */
function hypothetical(pair: Pair, result: MatchupResult, id: number): ReplayMatchup {
  return { id, albumAId: pair.a.id, albumBId: pair.b.id, result, createdAt: "9999-12-31T23:59:59.999Z" };
}

/**
 * The cover URLs of every pair the next action can serve from `pair`, given the same stored matchups, `avoid` and `seed`.
 * Null covers, repeats and the current pair's own covers are left out.
 */
function upcomingCovers(db: DatabaseSync, pair: Pair, avoid: Set<string>, seed: number): string[] {
  const stored = listMatchups(db);
  const nextId = Math.max(0, ...stored.map((matchup) => matchup.id)) + 1;
  const served: (Pair | undefined)[] = RESULTS.map((result) =>
    pickPair(db, loadRatings(db, [hypothetical(pair, result, nextId)]), avoid, seed),
  );
  served.push(pickPair(db, loadRatings(db), new Set(avoid).add(pairKey(pair.a.id, pair.b.id)), seed));

  const newest = stored.at(-1);
  const a = newest && loadAlbumCard(db, newest.albumAId);
  const b = newest && loadAlbumCard(db, newest.albumBId);
  if (a && b) served.push({ a, b });

  const own = new Set([pair.a.coverUrl, pair.b.coverUrl]);
  const urls = served.flatMap((next) => (next ? [next.a.coverUrl, next.b.coverUrl] : []));
  return [...new Set(urls.filter((url): url is string => url !== null && !own.has(url)))];
}

function withUpcoming(
  db: DatabaseSync,
  avoid: Set<string>,
  base: { pair: Pair | null; count: number; lastAnswer: MatchupView["lastAnswer"]; progress: RankingProgress | null },
): MatchupView {
  const seed = Math.random();
  const upcoming = base.pair ? upcomingCovers(db, base.pair, avoid, seed) : [];
  return { ...base, canUndo: base.count > 0, seed, upcoming };
}

function view(db: DatabaseSync, avoid: Set<string>, random: () => number, lastAnswer: MatchupView["lastAnswer"]): MatchupView {
  const { pair, count, progress } = loadMatchupState(db, avoid, random);
  return withUpcoming(db, avoid, { pair, count, lastAnswer, progress });
}

/** The first view of the matchup screen: a fresh pair with nothing avoided, and the covers that may follow it. */
export function initialMatchupView(db: DatabaseSync): MatchupView {
  return view(db, new Set(), Math.random, null);
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
  seed: unknown,
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
  return view(db, parseAvoid(avoid), randomFor(seed, random), { text: changeText(before, after, [a, b])! });
}

/** Records nothing. The skipped pair is avoided from now on, so the next pair is a different one. */
export function skipMatchup(
  db: DatabaseSync,
  albumAId: unknown,
  albumBId: unknown,
  avoid: unknown,
  seed: unknown,
  random: () => number = Math.random,
): MatchupActionResult {
  if (!isId(albumAId) || !isId(albumBId) || albumAId === albumBId) {
    return { error: "That pair wasn't valid. Reload the page." };
  }
  const avoided = parseAvoid(avoid).add(pairKey(albumAId, albumBId));
  return view(db, avoided, randomFor(seed, random), null);
}

/** Deletes the newest matchup and serves its pair again, so the user can answer it differently. */
export function undoMatchup(
  db: DatabaseSync,
  avoid: unknown,
  seed: unknown,
  random: () => number = Math.random,
): MatchupActionResult {
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
    return withUpcoming(db, parseAvoid(avoid), { pair: { a, b }, count: countMatchups(db), lastAnswer, progress: progressOf(afterState) });
  }
  // One of the albums has lost its placement since, so the pair can't be asked again.
  return view(db, parseAvoid(avoid), randomFor(seed, random), lastAnswer);
}
