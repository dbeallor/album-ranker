import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAlbum, findAlbumByCatalogId } from "@/lib/db/albums";
import { memoryDb } from "@/lib/db/test-db";

const state = vi.hoisted(() => ({ db: undefined as unknown, resolveCover: vi.fn() }));

vi.mock("@/lib/db/server", () => ({ getDb: () => state.db }));
vi.mock("@/lib/catalog/server-cover", () => ({ resolveCover: state.resolveCover }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

import { addToLibraryAction } from "./actions";

const CATALOG_ID = "11111111-2222-3333-4444-555555555555";
const DEEZER_COVER = "https://cdn-images.dzcdn.net/images/cover/abc/250x250-000000-80-0-0.jpg";

const db = () => state.db as ReturnType<typeof memoryDb>;

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
    state.resolveCover.mockReset();
    state.resolveCover.mockResolvedValue(null);
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

  it.each([
    { name: "stores the cover the server resolved", resolved: DEEZER_COVER, expected: DEEZER_COVER },
    { name: "stores no cover when none was found", resolved: null, expected: null },
  ])("$name", async ({ resolved, expected }) => {
    state.resolveCover.mockResolvedValue(resolved);
    await redirectOf(addToLibraryAction(form()));

    expect(state.resolveCover).toHaveBeenCalledWith({ catalogId: CATALOG_ID, title: "Kind of Blue", artist: "Miles Davis" });
    expect(findAlbumByCatalogId(db(), CATALOG_ID)?.coverUrl).toBe(expected);
  });

  it.each<{ name: string; overrides: Record<string, string> }>([
    { name: "a bad library year", overrides: { year: "1800" } },
    { name: "a bad catalog id", overrides: { catalogId: "x" } },
    { name: "a bad artist id", overrides: { artistId: "artist-1" } },
    { name: "a long title", overrides: { title: "t".repeat(301) } },
    { name: "a long artist", overrides: { artist: "a".repeat(301) } },
    { name: "a bad release year", overrides: { releaseYear: "99999" } },
  ])("does not look up a cover for $name", async ({ overrides }) => {
    const url = await redirectOf(addToLibraryAction(form(overrides)));

    expect(url.searchParams.has("error")).toBe(true);
    expect(state.resolveCover).not.toHaveBeenCalled();
  });

  it("looks up the cover with the lower-cased catalog id and trimmed names", async () => {
    const lower = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    await redirectOf(addToLibraryAction(form({ catalogId: lower.toUpperCase(), title: "Kind of Blue", artist: "Miles Davis" })));

    expect(state.resolveCover).toHaveBeenCalledWith({ catalogId: lower, title: "Kind of Blue", artist: "Miles Davis" });
  });

  it("ignores the cover the browser sent", async () => {
    await redirectOf(addToLibraryAction(form({ coverUrl: DEEZER_COVER })));

    expect(findAlbumByCatalogId(db(), CATALOG_ID)?.coverUrl).toBeNull();
  });

  it("skips the lookup and keeps the stored cover when the album already exists", async () => {
    createAlbum(db(), { title: "Kind of Blue", artist: { name: "Miles Davis" }, catalogId: CATALOG_ID, coverUrl: DEEZER_COVER });
    state.resolveCover.mockResolvedValue("https://coverartarchive.org/other");
    await redirectOf(addToLibraryAction(form()));

    expect(state.resolveCover).not.toHaveBeenCalled();
    expect(findAlbumByCatalogId(db(), CATALOG_ID)?.coverUrl).toBe(DEEZER_COVER);
  });
});
