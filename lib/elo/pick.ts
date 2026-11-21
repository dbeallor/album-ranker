export type PickAlbum = { id: number; year: number; rating: number };
export type PickMatchup = { albumAId: number; albumBId: number };

/** An unordered pair as a string, the same for (a, b) and (b, a). */
export function pairKey(idA: number, idB: number): string {
  return idA < idB ? `${idA}-${idB}` : `${idB}-${idA}`;
}

/**
 * Picks two albums from different years. The first album has the fewest matchups (random among ties,
 * skipping albums with no unplayed opponent); its opponent is the closest-rated unplayed, unavoided one
 * (lower id on a tie). When no unplayed pair exists, falls back to the closest-rated opponent, played or not.
 * `matchups` are the ones the replay used. Returns undefined when no two albums are from different years.
 */
export function pickMatchup(input: {
  albums: PickAlbum[];
  matchups: PickMatchup[];
  avoid: Set<string>;
  random: () => number;
}): { a: number; b: number } | undefined {
  const albums = [...input.albums].sort((x, y) => x.id - y.id);
  const played = new Set(input.matchups.map((m) => pairKey(m.albumAId, m.albumBId)));
  const counts = new Map<number, number>();
  for (const { albumAId, albumBId } of input.matchups) {
    counts.set(albumAId, (counts.get(albumAId) ?? 0) + 1);
    counts.set(albumBId, (counts.get(albumBId) ?? 0) + 1);
  }

  const opponentsOf = (album: PickAlbum) => albums.filter((other) => other.year !== album.year);
  const closest = (album: PickAlbum, candidates: PickAlbum[]) =>
    candidates.reduce((best, other) => {
      const gap = Math.abs(other.rating - album.rating);
      const bestGap = Math.abs(best.rating - album.rating);
      return gap < bestGap || (gap === bestGap && other.id < best.id) ? other : best;
    });
  const unplayedOpponents = (album: PickAlbum) =>
    opponentsOf(album).filter((other) => {
      const key = pairKey(album.id, other.id);
      return !played.has(key) && !input.avoid.has(key);
    });

  const chooseFirst = (pool: PickAlbum[]) => {
    const fewest = Math.min(...pool.map((album) => counts.get(album.id) ?? 0));
    const ties = pool.filter((album) => (counts.get(album.id) ?? 0) === fewest);
    return ties[Math.min(Math.floor(input.random() * ties.length), ties.length - 1)];
  };

  const withUnplayed = albums.filter((album) => unplayedOpponents(album).length > 0);
  if (withUnplayed.length > 0) {
    const first = chooseFirst(withUnplayed);
    return { a: first.id, b: closest(first, unplayedOpponents(first)).id };
  }

  const withOpponents = albums.filter((album) => opponentsOf(album).length > 0);
  if (withOpponents.length === 0) return undefined;
  const first = chooseFirst(withOpponents);
  return { a: first.id, b: closest(first, opponentsOf(first)).id };
}
