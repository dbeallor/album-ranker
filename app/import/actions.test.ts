import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAlbum, findAlbumByCatalogId, listAlbums } from "@/lib/db/albums";
import { createImportReviewItem, getImportReviewItem } from "@/lib/db/import-review";
import { addToLibrary, listLibrary } from "@/lib/db/library";
import { memoryDb } from "@/lib/db/test-db";

const state = vi.hoisted(() => ({ db: undefined as unknown, resolveCover: vi.fn() }));

vi.mock("@/lib/db/server", () => ({ getDb: () => state.db }));
vi.mock("@/lib/catalog/server-cover", () => ({ resolveCover: state.resolveCover }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ refresh }));

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

  function seedMore(year: number, title: string) {
    return createImportReviewItem(state.db as ReturnType<typeof memoryDb>, {
      source: { title, artist: "Fake Artist A", year },
      sourcePlacement: "listed",
      candidates: [],
    });
  }

  it("keeping a manual album adds it to the library, refreshes and redirects to ?done=<id> with no fragment when none are left", async () => {
    const review = seed();
    const url = await redirectOf(keepManualAction(form(review.id)));
    expect(url.pathname).toBe("/import");
    expect(Object.fromEntries(url.searchParams)).toEqual({ done: String(review.id) });
    expect(url.hash).toBe("");
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(listLibrary(state.db as ReturnType<typeof memoryDb>)).toHaveLength(1);
  });

  it("scrolls to the open item that takes the handled item's place", async () => {
    const first = seed();
    const second = seedMore(2002, "Fake Album Two");
    const url = await redirectOf(skipAction(form(first.id)));
    expect(Object.fromEntries(url.searchParams)).toEqual({ done: String(first.id) });
    expect(url.hash).toBe(`#item-${second.id}`);
  });

  it("choosing a catalog album redirects with done and the next item", async () => {
    const first = seed();
    const second = seedMore(2002, "Fake Album Two");
    const data = form(first.id);
    data.set("catalogId", "11111111-2222-3333-4444-555555555555");
    data.set("title", "Fake Album One");
    data.set("artist", "Fake Artist A");
    data.set("releaseYear", "2001");
    const url = await redirectOf(chooseAlbumAction(data));
    expect(Object.fromEntries(url.searchParams)).toEqual({ done: String(first.id) });
    expect(url.hash).toBe(`#item-${second.id}`);
    expect(listLibrary(state.db as ReturnType<typeof memoryDb>)).toHaveLength(1);
  });

  it("skipping redirects to ?done=<id> and adds nothing", async () => {
    const review = seed();
    const url = await redirectOf(skipAction(form(review.id)));
    expect(Object.fromEntries(url.searchParams)).toEqual({ done: String(review.id) });
    expect(listLibrary(state.db as ReturnType<typeof memoryDb>)).toEqual([]);
  });

  it("a second submit on the same item redirects to ?done=<id> without an error and changes nothing", async () => {
    const review = seed();
    await redirectOf(keepManualAction(form(review.id)));
    const libraryAfterFirst = listLibrary(state.db as ReturnType<typeof memoryDb>);
    const url = await redirectOf(keepManualAction(form(review.id)));
    expect(url.searchParams.get("done")).toBe(String(review.id));
    expect(url.searchParams.get("already")).toBe("1");
    expect(url.searchParams.has("error")).toBe(false);
    expect(listLibrary(state.db as ReturnType<typeof memoryDb>)).toEqual(libraryAfterFirst);

    const skipUrl = await redirectOf(skipAction(form(review.id)));
    expect(skipUrl.searchParams.has("error")).toBe(false);
    expect(skipUrl.searchParams.get("done")).toBe(String(review.id));
  });

  it("an item that does not exist is still an error", async () => {
    const url = await redirectOf(skipAction(form(999)));
    expect(Object.fromEntries(url.searchParams)).toEqual({ error: "Import review item 999 does not exist.", item: "999" });
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

    it("marks the redirect moved=1 only when the album was already in the library", async () => {
      const db = state.db as ReturnType<typeof memoryDb>;
      const album = createAlbum(db, { title: "Fake Album One", artist: { name: "Fake Artist A" }, catalogId: CATALOG_ID });
      addToLibrary(db, { albumId: album.id, year: 1999 });
      const moving = seed();
      const move = await redirectOf(chooseAlbumAction(choice(moving.id, { moveHere: "1" })));
      expect(Object.fromEntries(move.searchParams)).toEqual({ done: String(moving.id), moved: "1" });
      expect(listLibrary(db).map((entry) => entry.year)).toEqual([2001]);

      const adding = seedMore(2002, "Fake Album Two");
      const add = await redirectOf(chooseAlbumAction(choice(adding.id, { catalogId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", title: "Fake Album Two" })));
      expect(Object.fromEntries(add.searchParams)).toEqual({ done: String(adding.id) });
    });

    it.each<{ name: string; over: Record<string, string>; message: string }>([
      { name: "a catalog id that is not a UUID", over: { catalogId: "x" }, message: "That album's catalog id isn't valid." },
      { name: "an artist id that is not UUIDs", over: { artistId: "artist-1" }, message: "That album's artist id isn't valid." },
      { name: "a title of 301 characters", over: { title: "t".repeat(301) }, message: "That album's title isn't valid." },
      { name: "an artist of 301 characters", over: { artist: "a".repeat(301) }, message: "That album's artist isn't valid." },
      { name: "a release year of 99999", over: { releaseYear: "99999" }, message: "That album's release year isn't valid." },
      { name: "a release year of 0", over: { releaseYear: "0" }, message: "That album's release year isn't valid." },
      { name: "a release year of abc", over: { releaseYear: "abc" }, message: "That album's release year isn't valid." },
    ])("rejects $name before any lookup, stores nothing and keeps the item open", async ({ over, message }) => {
      const db = state.db as ReturnType<typeof memoryDb>;
      const review = seed();
      const url = await redirectOf(chooseAlbumAction(choice(review.id, over)));

      expect(Object.fromEntries(url.searchParams)).toEqual({ error: message, item: String(review.id) });
      expect(state.resolveCover).not.toHaveBeenCalled();
      expect(listAlbums(db)).toEqual([]);
      expect(listLibrary(db)).toEqual([]);
      expect(getImportReviewItem(db, review.id)?.status).toBe("open");
    });

    it("reuses the album stored in lower case when the id comes in upper case", async () => {
      const db = state.db as ReturnType<typeof memoryDb>;
      const lower = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
      const review = seed();
      createAlbum(db, { title: "Fake Album One", artist: { name: "Fake Artist A" }, catalogId: lower, coverUrl: DEEZER_COVER });
      const url = await redirectOf(chooseAlbumAction(choice(review.id, { catalogId: lower.toUpperCase() })));

      expect(Object.fromEntries(url.searchParams)).toEqual({ done: String(review.id) });
      expect(state.resolveCover).not.toHaveBeenCalled();
      expect(listAlbums(db)).toHaveLength(1);
      expect(listLibrary(db)).toHaveLength(1);
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
