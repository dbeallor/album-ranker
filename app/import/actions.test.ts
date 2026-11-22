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

import { keepManualAction, skipAction } from "./actions";

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
});
