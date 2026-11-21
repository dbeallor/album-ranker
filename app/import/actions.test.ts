import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAlbum } from "@/lib/db/albums";
import { MAX_DECADE_LIST, setDecadeList } from "@/lib/db/decade-lists";
import { createImportReviewItem } from "@/lib/db/import-review";
import { memoryDb } from "@/lib/db/test-db";
import { addYearEntry } from "@/lib/db/year-entries";

const state = vi.hoisted(() => ({ db: undefined as unknown }));

vi.mock("@/lib/db/server", () => ({ getDb: () => state.db }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

import { keepManualAction } from "./actions";

async function redirectOf(action: Promise<void>): Promise<URL> {
  const message = await action.then(
    () => "",
    (error: Error) => error.message,
  );
  expect(message).toMatch(/^redirect:/);
  return new URL(message.slice("redirect:".length), "http://localhost");
}

describe("import review actions", () => {
  beforeEach(() => {
    state.db = memoryDb();
  });
  afterEach(() => vi.clearAllMocks());

  function form(itemId: number): FormData {
    const data = new FormData();
    data.set("itemId", String(itemId));
    return data;
  }

  function seed(fullList: boolean) {
    const db = state.db as ReturnType<typeof memoryDb>;
    if (fullList) {
      const ids = Array.from({ length: MAX_DECADE_LIST }, (_, i) => {
        const album = createAlbum(db, { title: `Fake Filler ${i}`, artist: { name: `Fake Filler Artist ${i}` } });
        addYearEntry(db, { albumId: album.id, year: 2002, placement: "honorable_mention" });
        return album.id;
      });
      setDecadeList(db, 2000, ids);
    }
    return createImportReviewItem(db, {
      source: { title: "Fake Album <One>", artist: "Fake Artist A", year: 2001 },
      sourcePlacement: "honorable_mention",
      sourceDecadeRank: 2,
      candidates: [],
    });
  }

  it("sends the album title in `full` when the decade list is full", async () => {
    const review = seed(true);
    const url = await redirectOf(keepManualAction(form(review.id)));
    expect(url.pathname).toBe("/import");
    expect(Object.fromEntries(url.searchParams)).toEqual({ full: "Fake Album <One>" });
  });

  it("sends no `full` when the album went on the decade list", async () => {
    const review = seed(false);
    const url = await redirectOf(keepManualAction(form(review.id)));
    expect(Object.fromEntries(url.searchParams)).toEqual({});
  });
});
