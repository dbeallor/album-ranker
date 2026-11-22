import type { ReplayMatchup } from "./replay";

/** Spread of an album's true rating around the start rating before any matchup, in Elo points. */
export const PRIOR_SPREAD = 200;
/** The share of album pairs in the right order that counts as "approximately right". */
export const TARGET_CONFIDENCE = 0.9;

export type RankingProgress = {
  albumCount: number;
  /** Counted matchups. */
  played: number;
  /** The expected share of album pairs in the right order, 0.5 to 1. */
  confidence: number;
  target: number;
  /** Estimated matchups still to play to reach the target. */
  remaining: number;
  /** `played + remaining`. */
  goal: number;
  /** 0 to 100, unrounded. */
  percent: number;
};

const Q = Math.log(10) / 400;
const Q2 = Q * Q;
const PRIOR_PRECISION = 1 / PRIOR_SPREAD ** 2;
const MAX_DOUBLINGS = 60;

/** The mean over all pairs of the chance the pair's current order matches the true order. */
function meanPairChance(precision: Float64Array, extraPerAlbum: number): number {
  const n = precision.length;
  const inverse = new Float64Array(n);
  for (let i = 0; i < n; i++) inverse[i] = 1 / (precision[i] + extraPerAlbum);

  const priorTotal = 2 * PRIOR_SPREAD ** 2;
  let sum = 0;
  for (let i = 0; i < n - 1; i++) {
    const vi = inverse[i];
    for (let j = i + 1; j < n; j++) {
      const s2 = vi + inverse[j];
      const tau2 = priorTotal - s2;
      sum += tau2 > 0 ? 0.5 + Math.atan(Math.sqrt(tau2 / s2)) / Math.PI : 0.5;
    }
  }
  return sum / ((n * (n - 1)) / 2);
}

/**
 * How far the ratings are from an order that is approximately right, and how many more matchups
 * it takes. Null with fewer than two albums, since there are no pairs to order.
 *
 * The model is Bayesian: each album's true rating starts spread by `PRIOR_SPREAD` around its start
 * rating, and each counted matchup adds `q² · p · (1 − p)` of information to both albums. The
 * confidence is the mean, over all pairs, of the chance the pair is in the right order. The matchups
 * remaining are the smallest number of extra matchups between near-equal albums, spread evenly over
 * all albums, that reaches `TARGET_CONFIDENCE`.
 */
export function computeProgress(
  ratings: Map<number, number>,
  used: Pick<ReplayMatchup, "albumAId" | "albumBId">[],
): RankingProgress | null {
  const albumCount = ratings.size;
  if (albumCount < 2) return null;

  const index = new Map<number, number>();
  for (const id of ratings.keys()) index.set(id, index.size);
  const precision = new Float64Array(albumCount).fill(PRIOR_PRECISION);

  let played = 0;
  for (const { albumAId, albumBId } of used) {
    const a = index.get(albumAId);
    const b = index.get(albumBId);
    if (a === undefined || b === undefined) continue;
    const p = 1 / (1 + 10 ** ((ratings.get(albumBId)! - ratings.get(albumAId)!) / 400));
    const information = Q2 * p * (1 - p);
    precision[a] += information;
    precision[b] += information;
    played++;
  }

  // Each extra matchup adds q² / 4 to two albums, spread evenly: 2 · extra / n matchups' worth each.
  const confidenceAt = (extra: number) => meanPairChance(precision, ((2 * extra) / albumCount) * (Q2 / 4));

  const confidence = confidenceAt(0);
  let remaining = 0;
  if (confidence < TARGET_CONFIDENCE) {
    let low = 0;
    let high = 1;
    for (let step = 0; step < MAX_DOUBLINGS && confidenceAt(high) < TARGET_CONFIDENCE; step++) {
      low = high;
      high *= 2;
    }
    // `low` falls short of the target and `high` reaches it, so the answer is in (low, high].
    while (high - low > 1) {
      const middle = Math.floor((low + high) / 2);
      if (confidenceAt(middle) >= TARGET_CONFIDENCE) high = middle;
      else low = middle;
    }
    remaining = high;
  }

  const goal = played + remaining;
  return {
    albumCount,
    played,
    confidence,
    target: TARGET_CONFIDENCE,
    remaining,
    goal,
    percent: goal === 0 ? 0 : (100 * played) / goal,
  };
}

/** A whole percent, rounded down, so 100 shows only when nothing remains and 90 only at the target. */
export function formatPercent(value: number): string {
  return String(Math.floor(value + 1e-9));
}
