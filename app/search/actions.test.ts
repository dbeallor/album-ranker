import { beforeEach, describe, expect, it, vi } from "vitest";
import { findAlbumByCatalogId } from "@/lib/db/albums";
import { memoryDb } from "@/lib/db/test-db";

const state = vi.hoisted(() => ({ db: undefined as unknown }));

vi.mock("@/lib/db/server", () => ({ getDb: () => state.db }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

import { addToLibraryAction } from "./actions";

const CATALOG_ID = "11111111-2222-3333-4444-555555555555";

async function redirectOf(action: Promise<void>): Promise<URL> {
  const message = await action.then(
    () => "",
    (error: Error) => error.message,
  );
  expect(message).toMatch(/^redirect:/);
  return new URL(message.slice("redirect:".length), "http://localhost");
}

function form(overrides: Record<string, string> = {}): FormData {
  const data = new FormData();
  const fields = {
    q: "kind of blue",
    catalogId: CATALOG_ID,
    title: "Kind of Blue",
    artist: "Miles Davis",
    artistId: "",
    releaseYear: "1959",
    coverUrl: "",
    year: "1959",
    ...overrides,
  };
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

describe("addToLibraryAction", () => {
  beforeEach(() => {
    state.db = memoryDb();
  });

  it.each([
    {
      name: "success goes back to the search with the album marked added",
      overrides: { year: "1959" },
      params: { q: "kind of blue", added: CATALOG_ID },
      stored: true,
    },
    {
      name: "failure goes back to the search with the error and the album",
      overrides: { year: "1800" },
      params: { q: "kind of blue", error: "Enter a year from 1900 to 2100.", item: CATALOG_ID },
      stored: false,
    },
  ])("$name", async ({ overrides, params, stored }) => {
    const url = await redirectOf(addToLibraryAction(form(overrides)));

    expect(url.pathname).toBe("/search");
    expect(Object.fromEntries(url.searchParams)).toEqual(params);
    expect(findAlbumByCatalogId(state.db as ReturnType<typeof memoryDb>, CATALOG_ID) !== undefined).toBe(stored);
  });
});
