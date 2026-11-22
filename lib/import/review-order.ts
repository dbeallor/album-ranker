import type { ImportReviewItem } from "../db/types.ts";

/** The review page lists open items oldest sheet year first, then by id. */
export function openInReviewOrder(items: ImportReviewItem[]): ImportReviewItem[] {
  return items.filter((item) => item.status === "open").sort((a, b) => a.source.year - b.source.year || a.id - b.id);
}

/**
 * The id of the open item that now sits where `handled` was on the page: the first open item after it in review
 * order, or the last open item when it was the last one. Null when no item is open.
 */
export function nextOpenItemId(items: ImportReviewItem[], handled: ImportReviewItem): number | null {
  const open = openInReviewOrder(items);
  const after = open.find(
    (item) => item.source.year > handled.source.year || (item.source.year === handled.source.year && item.id > handled.id),
  );
  return (after ?? open[open.length - 1])?.id ?? null;
}
