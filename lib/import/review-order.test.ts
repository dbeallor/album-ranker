import { describe, expect, it } from "vitest";
import type { ImportReviewItem, ReviewStatus } from "../db/types.ts";
import { nextOpenItemId, openInReviewOrder } from "./review-order.ts";

function item(id: number, year: number, status: ReviewStatus = "open"): ImportReviewItem {
  return {
    id,
    source: { title: `Album ${id}`, artist: "Artist", year },
    sourcePlacement: "listed",
    sourceRank: null,
    sourceDecadeRank: null,
    reason: "no_match",
    reasonDetail: null,
    candidates: [],
    status,
    resolvedAlbumId: null,
    createdAt: "",
    updatedAt: "",
  };
}

describe("review order", () => {
  const items = [item(1, 2000), item(2, 1990), item(3, 1990), item(4, 1980, "resolved"), item(5, 2010)];

  it("lists open items by sheet year, then id", () => {
    expect(openInReviewOrder(items).map((i) => i.id)).toEqual([2, 3, 1, 5]);
  });

  it("names the open item after the handled one", () => {
    expect(nextOpenItemId(items, items[1])).toBe(3);
    expect(nextOpenItemId(items, items[3])).toBe(2);
  });

  it("falls back to the last open item when the handled one was last", () => {
    expect(nextOpenItemId(items, items[4])).toBe(5);
    expect(nextOpenItemId([item(1, 2000), item(2, 2010, "resolved")], item(2, 2010, "resolved"))).toBe(1);
  });

  it("is null when nothing is open", () => {
    expect(nextOpenItemId([item(1, 2000, "skipped")], item(1, 2000, "skipped"))).toBeNull();
  });
});
