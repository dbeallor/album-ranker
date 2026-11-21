export const MAX_LIST = 25;

export type DecadeMove =
  | { kind: "drop"; from: number; to: number }
  | { kind: "up"; id: number }
  | { kind: "down"; id: number }
  | { kind: "add"; id: number }
  | { kind: "remove"; id: number };

export type DecadeSummary = { decade: number; listCount: number; eligibleCount: number };

/** The year page year rounded down to a multiple of 10. */
function decadeOfYear(year: number): number {
  return Math.floor(year / 10) * 10;
}

/** Highest rating first, ties to the lower album id, first 25. */
export function sortByRating<T extends { albumId: number; rating: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.rating - a.rating || a.albumId - b.albumId);
}

export function suggestDecadeList(eligible: { albumId: number; rating: number }[]): number[] {
  return sortByRating(eligible)
    .slice(0, MAX_LIST)
    .map((item) => item.albumId);
}

/** The new order after a drop, move up or down, add at the end or remove. Impossible moves change nothing. */
export function moveInList(ids: number[], move: DecadeMove): number[] {
  const next = [...ids];
  switch (move.kind) {
    case "drop": {
      if (!inRange(next, move.from) || !inRange(next, move.to) || move.from === move.to) return ids;
      const [moved] = next.splice(move.from, 1);
      next.splice(move.to, 0, moved);
      return next;
    }
    case "up":
    case "down": {
      const from = next.indexOf(move.id);
      const to = move.kind === "up" ? from - 1 : from + 1;
      if (from === -1 || !inRange(next, to)) return ids;
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    }
    case "add":
      if (next.includes(move.id) || next.length >= MAX_LIST) return ids;
      return [...next, move.id];
    case "remove":
      return next.includes(move.id) ? next.filter((id) => id !== move.id) : ids;
  }
}

function inRange(ids: number[], index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < ids.length;
}

/**
 * Picker rows, oldest decade first, for each decade with any year entry (any placement) or any list entry.
 * Only ranked and honorable mention entries are eligible.
 */
export function decadeSummaries(
  entries: { year: number; placement: "ranked" | "honorable_mention" | "listed" }[],
  listEntries: { decade: number }[],
): DecadeSummary[] {
  const rows = new Map<number, DecadeSummary>();
  const row = (decade: number) => {
    let found = rows.get(decade);
    if (!found) rows.set(decade, (found = { decade, listCount: 0, eligibleCount: 0 }));
    return found;
  };
  for (const entry of entries) {
    const summary = row(decadeOfYear(entry.year));
    if (entry.placement !== "listed") summary.eligibleCount += 1;
  }
  for (const entry of listEntries) row(entry.decade).listCount += 1;
  return [...rows.values()].sort((a, b) => a.decade - b.decade);
}
