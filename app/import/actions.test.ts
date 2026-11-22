import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAlbum, findAlbumByCatalogId } from "@/lib/db/albums";
import { createImportReviewItem } from "@/lib/db/import-review";
import { listLibrary } from "@/lib/db/library";
import { memoryDb } from "@/lib/db/test-db";

const state = vi.hoisted(() => ({ db: undefined as unknown, resolveCover: vi.fn() }));

vi.mock("@/lib/db/server", () => ({ getDb: () => state.db }));
vi.mock("@/lib/catalog/server-cover", () => ({ resolveCover: state.resolveCover }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

import { chooseAlbumAction, keepManualAction, skipAction } from "./actions";

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
    state.resolveCover.mockReset();
    state.resolveCover.mockResolvedValue(null);
  });
  afterEach(() => vi.clearAllMocks());

  function form(itemId: number | string): FormData {
    const data = new FormData();
    data.set("itemId", String(itemId));
    return data;
  }

  function seed() {
    return createImportReviewItem(state.db as ReturnType<typeof memoryDb>, {
      source: { title: "Fake Album <One>", artist: "Fake Artist A", year: 2001 },
      sourcePlacement: "honorable_mention",
      sourceDecadeRank: 2,
      candidates: [],
    });
  }

  it("keeping a manual album adds it to the library and goes back to /import with nothing in the query", async () => {
    const review = seed();
    const url = await redirectOf(keepManualAction(form(review.id)));
    expect(url.pathname).toBe("/import");
    expect(Object.fromEntries(url.searchParams)).toEqual({});
    expect(listLibrary(state.db as ReturnType<typeof memoryDb>)).toHaveLength(1);
  });

  it("skipping goes back to /import with nothing in the query and adds nothing", async () => {
    const review = seed();
    const url = await redirectOf(skipAction(form(review.id)));
    expect(Object.fromEntries(url.searchParams)).toEqual({});
    expect(listLibrary(state.db as ReturnType<typeof memoryDb>)).toEqual([]);
  });

  it("an item that is already resolved comes back with its message", async () => {
    const review = seed();
    await redirectOf(keepManualAction(form(review.id)));
    const url = await redirectOf(keepManualAction(form(review.id)));
    expect(Object.fromEntries(url.searchParams)).toEqual({ error: "This item is already resolved.", item: String(review.id) });
  });

  describe("choosing a catalog album", () => {
    const CATALOG_ID = "11111111-2222-3333-4444-555555555555";
    const DEEZER_COVER = "https://cdn-images.dzcdn.net/images/cover/abc/250x250-000000-80-0-0.jpg";
    const stored = () => findAlbumByCatalogId(state.db as ReturnType<typeof memoryDb>, CATALOG_ID);

    function choice(itemId: number, over: Record<string, string> = {}): FormData {
      const data = form(itemId);
      const fields = { catalogId: CATALOG_ID, title: "Fake Album One", artist: "Fake Artist A", artistId: "", releaseYear: "2001", ...over };
      for (const [name, value] of Object.entries(fields)) data.set(name, value);
      return data;
    }

    it("stores the cover the server resolved, not the one the browser sent", async () => {
      const review = seed();
      state.resolveCover.mockResolvedValue(DEEZER_COVER);
      await redirectOf(chooseAlbumAction(choice(review.id, { coverUrl: "https://coverartarchive.org/from-the-browser" })));

      expect(state.resolveCover).toHaveBeenCalledWith({ catalogId: CATALOG_ID, title: "Fake Album One", artist: "Fake Artist A" });
      expect(stored()?.coverUrl).toBe(DEEZER_COVER);
    });

    it("stores no cover when none was found", async () => {
      const review = seed();
      await redirectOf(chooseAlbumAction(choice(review.id)));

      expect(stored()?.coverUrl).toBeNull();
    });

    it("skips the lookup and keeps the stored cover when the album already exists", async () => {
      const review = seed();
      createAlbum(state.db as ReturnType<typeof memoryDb>, { title: "Fake Album One", artist: { name: "Fake Artist A" }, catalogId: CATALOG_ID, coverUrl: DEEZER_COVER });
      await redirectOf(chooseAlbumAction(choice(review.id)));

      expect(state.resolveCover).not.toHaveBeenCalled();
      expect(stored()?.coverUrl).toBe(DEEZER_COVER);
      expect(listLibrary(state.db as ReturnType<typeof memoryDb>)).toHaveLength(1);
    });
  });
});
