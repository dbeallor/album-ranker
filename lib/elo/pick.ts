import type { EloResult } from "./elo";

export type PickAlbum = { id: number; rating: number };
export type PickMatchup = { albumAId: number; albumBId: number; result: EloResult };

/** An album with fewer counted matchups than this is new (being placed); with this many or more it is established. */
export const PLACEMENT_MATCHUPS = 8;

/** An unordered pair as a string, the same for (a, b) and (b, a). */
export function pairKey(idA: number, idB: number): string {
  return idA < idB ? `${idA}-${idB}` : `${idB}-${idA}`;
}

function countMatchups(matchups: PickMatchup[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const { albumAId, albumBId } of matchups) {
    counts.set(albumAId, (counts.get(albumAId) ?? 0) + 1);
    counts.set(albumBId, (counts.get(albumBId) ?? 0) + 1);
  }
  return counts;
}

/** The established albums other than `excludeId`, rating ascending (id ascending on a tie). */
function establishedByRating(albums: PickAlbum[], counts: Map<number, number>, excludeId: number): PickAlbum[] {
  return albums
    .filter((album) => album.id !== excludeId && (counts.get(album.id) ?? 0) >= PLACEMENT_MATCHUPS)
    .sort((x, y) => x.rating - y.rating || x.id - y.id);
}

/**
 * The insertion slots `[lo, hi]` still possible for an album among the established albums sorted by rating:
 * slot s means above the s-th established album and below the next. Starts at every slot and narrows with each
 * counted matchup against an established album, oldest first. A contradicting answer (lo > hi) wins by being newest.
 */
export function placementSlot(input: {
  albumId: number;
  albums: PickAlbum[];
  matchups: PickMatchup[];
}): { lo: number; hi: number } {
  const established = establishedByRating(input.albums, countMatchups(input.matchups), input.albumId);
  const n = established.length;
  let lo = 0;
  let hi = n;
  for (const { albumAId, albumBId, result } of input.matchups) {
    const isA = albumAId === input.albumId;
    if (!isA && albumBId !== input.albumId) continue;
    const i = established.findIndex((album) => album.id === (isA ? albumBId : albumAId));
    if (i < 0) continue;
    const outcome = result === "tie" ? "tie" : (result === "a") === isA ? "win" : "loss";
    if (outcome === "win") {
      lo = Math.max(lo, i + 1);
      if (lo > hi) hi = n;
    } else if (outcome === "loss") {
      hi = Math.min(hi, i);
      if (lo > hi) lo = 0;
    } else {
      lo = Math.max(lo, i);
      hi = Math.min(hi, i + 1);
      if (lo > hi) {
        lo = i;
        hi = i + 1;
      }
    }
  }
  return { lo, hi };
}

/**
 * Picks two different albums. The first album has the fewest matchups (random among ties,
 * skipping albums with no unplayed opponent). A new first album (fewer than `PLACEMENT_MATCHUPS` matchups) is
 * matched against established albums by binary search over their rating order (see `placementSlot`);
 * otherwise, or when no established album is left to try, its opponent is the closest-rated unplayed, unavoided one
 * (lower id on a tie). When no unplayed pair exists, falls back to the closest-rated opponent, played or not.
 * `matchups` are the ones the replay used. Returns undefined when there are fewer than two albums.
 */
export function pickMatchup(input: {
  albums: PickAlbum[];
  matchups: PickMatchup[];
  avoid: Set<string>;
  random: () => number;
}): { a: number; b: number } | undefined {
  const albums = [...input.albums].sort((x, y) => x.id - y.id);
  const played = new Set(input.matchups.map((m) => pairKey(m.albumAId, m.albumBId)));
  const counts = countMatchups(input.matchups);

  const opponentsOf = (album: PickAlbum) => albums.filter((other) => other.id !== album.id);
  const closest = (album: PickAlbum, candidates: PickAlbum[]) =>
    candidates.reduce((best, other) => {
      const gap = Math.abs(other.rating - album.rating);
      const bestGap = Math.abs(best.rating - album.rating);
      return gap < bestGap || (gap === bestGap && other.id < best.id) ? other : best;
    });
  const isUnplayed = (album: PickAlbum, other: PickAlbum) => {
    const key = pairKey(album.id, other.id);
    return !played.has(key) && !input.avoid.has(key);
  };
  const unplayedOpponents = (album: PickAlbum) => opponentsOf(album).filter((other) => isUnplayed(album, other));

  const chooseFirst = (pool: PickAlbum[]) => {
    const fewest = Math.min(...pool.map((album) => counts.get(album.id) ?? 0));
    const ties = pool.filter((album) => (counts.get(album.id) ?? 0) === fewest);
    return ties[Math.min(Math.floor(input.random() * ties.length), ties.length - 1)];
  };

  /** The established opponent to try next: the middle of the slots still possible, else the nearest valid one. */
  const placementOpponent = (first: PickAlbum): PickAlbum | undefined => {
    const established = establishedByRating(albums, counts, first.id);
    if (!established.some((other) => isUnplayed(first, other))) return undefined;
    const { lo, hi } = placementSlot({ albumId: first.id, albums, matchups: input.matchups });
    const mid = Math.floor((lo + hi - 1) / 2);
    // With one slot left nothing is strictly inside it, so test the two albums beside it.
    const inside = lo < hi ? range(lo, hi - 1) : [lo - 1, lo].filter((i) => i >= 0 && i < established.length);
    const byDistance = (indexes: number[]) => indexes.sort((x, y) => Math.abs(x - mid) - Math.abs(y - mid) || x - y);
    const outside = established.map((_, i) => i).filter((i) => !inside.includes(i));
    const candidates = [...byDistance(inside), ...byDistance(outside)];
    const index = candidates.find((i) => isUnplayed(first, established[i]));
    return index === undefined ? undefined : established[index];
  };

  const withUnplayed = albums.filter((album) => unplayedOpponents(album).length > 0);
  if (withUnplayed.length > 0) {
    const first = chooseFirst(withUnplayed);
    const isNew = (counts.get(first.id) ?? 0) < PLACEMENT_MATCHUPS;
    const placed = isNew ? placementOpponent(first) : undefined;
    return { a: first.id, b: (placed ?? closest(first, unplayedOpponents(first))).id };
  }

  const withOpponents = albums.filter((album) => opponentsOf(album).length > 0);
  if (withOpponents.length === 0) return undefined;
  const first = chooseFirst(withOpponents);
  return { a: first.id, b: closest(first, opponentsOf(first)).id };
}

/** The integers from `from` to `to`, inclusive. */
function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}
