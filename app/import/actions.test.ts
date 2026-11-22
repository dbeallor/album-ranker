import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createImportReviewItem } from "@/lib/db/import-review";
import { listLibrary } from "@/lib/db/library";
import { memoryDb } from "@/lib/db/test-db";

const state = vi.hoisted(() => ({ db: undefined as unknown }));

vi.mock("@/lib/db/server", () => ({ getDb: () => state.db }));
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
    data.set("catalogId", "c-1");
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
});
