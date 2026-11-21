/** Pure placement logic for a year page. No database or React here, so the screen and its tests share it. */

export type Area = "ranked" | "honorable_mention" | "listed";

export type Placements = {
  /** Album ids in rank order: the first is rank 1. */
  ranked: number[];
  honorableMentions: number[];
  listed: number[];
};

export const MAX_RANKED = 10;

export type MoveTarget = {
  area: Area;
  /** Position in the ranked list to insert at. Omitted means the end. Ignored for the other areas. */
  index?: number;
};

export function areaOf(placements: Placements, albumId: number): Area | null {
  if (placements.ranked.includes(albumId)) return "ranked";
  if (placements.honorableMentions.includes(albumId)) return "honorable_mention";
  if (placements.listed.includes(albumId)) return "listed";
  return null;
}

export function removeAlbum(placements: Placements, albumId: number): Placements {
  return {
    ranked: placements.ranked.filter((id) => id !== albumId),
    honorableMentions: placements.honorableMentions.filter((id) => id !== albumId),
    listed: placements.listed.filter((id) => id !== albumId),
  };
}

/**
 * Moves the album to the target area. Ranked inserts at `index` (the end when omitted); the other areas append.
 * An album that comes into a full ranked list takes the slot asked for and the album at rank 10 is pushed
 * out to honorable mentions, reported as `pushedOut`. Moving within a full ranked list pushes nothing.
 */
export function applyMove(
  placements: Placements,
  albumId: number,
  target: MoveTarget,
): { placements: Placements; pushedOut: number | null } {
  const rest = removeAlbum(placements, albumId);
  if (target.area === "honorable_mention") {
    return { placements: { ...rest, honorableMentions: [...rest.honorableMentions, albumId] }, pushedOut: null };
  }
  if (target.area === "listed") {
    return { placements: { ...rest, listed: [...rest.listed, albumId] }, pushedOut: null };
  }

  const ranked = [...rest.ranked];
  let pushedOut: number | null = null;
  let index = Math.max(0, Math.min(target.index ?? ranked.length, ranked.length));
  if (ranked.length >= MAX_RANKED) {
    // Full: the newcomer takes a slot from 1 to 10 and the old rank 10 steps aside.
    index = Math.min(index, MAX_RANKED - 1);
    ranked.splice(index, 0, albumId);
    pushedOut = ranked.pop()!;
    return { placements: { ...rest, ranked, honorableMentions: [...rest.honorableMentions, pushedOut] }, pushedOut };
  }
  ranked.splice(index, 0, albumId);
  return { placements: { ...rest, ranked }, pushedOut };
}

/** One step toward rank 1. Does nothing for an album that is not ranked or is already first. */
export function moveUp(placements: Placements, albumId: number): Placements {
  const index = placements.ranked.indexOf(albumId);
  if (index <= 0) return placements;
  return applyMove(placements, albumId, { area: "ranked", index: index - 1 }).placements;
}

/** One step toward rank 10. Does nothing for an album that is not ranked or is already last. */
export function moveDown(placements: Placements, albumId: number): Placements {
  const index = placements.ranked.indexOf(albumId);
  if (index === -1 || index >= placements.ranked.length - 1) return placements;
  return applyMove(placements, albumId, { area: "ranked", index: index + 1 }).placements;
}
