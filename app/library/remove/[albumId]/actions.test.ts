import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAlbum, getAlbum } from "@/lib/db/albums";
import { addToLibrary } from "@/lib/db/library";
import { recordMatchup } from "@/lib/db/matchups";
import { memoryDb } from "@/lib/db/test-db";

const state = vi.hoisted(() => ({ db: undefined as unknown }));

vi.mock("@/lib/db/server", () => ({ getDb: () => state.db }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

import { removeAlbumAction } from "./actions";

async function redirectOf(action: Promise<void>): Promise<URL> {
  const message = await action.then(
    () => "",
    (error: Error) => error.message,
  );
  expect(message).toMatch(/^redirect:/);
  return new URL(message.slice("redirect:".length), "http://localhost");
}

describe("removeAlbumAction", () => {
  let db: ReturnType<typeof memoryDb>;
  let target: number;

  beforeEach(() => {
    db = state.db = memoryDb();
    target = createAlbum(db, { title: "Kind of Blue", artist: { name: "Miles Davis" } }).id;
    addToLibrary(db, { albumId: target, year: 1959 });
    const opponent = createAlbum(db, { title: "Giant Steps", artist: { name: "John Coltrane" } }).id;
    addToLibrary(db, { albumId: opponent, year: 1960 });
    recordMatchup(db, { albumAId: target, albumBId: opponent, result: "a", createdAt: "2025-01-01T00:00:00.000Z" });
  });

  function form(albumId: number | string, matchups: number | string): FormData {
    const data = new FormData();
    data.set("albumId", String(albumId));
    data.set("matchups", String(matchups));
    return data;
  }

  it.each([
    {
      name: "success goes to the library with what was removed",
      albumId: () => target,
      matchups: 1,
      path: "/library",
      params: { removed: "1", matchups: "1" },
      removed: true,
    },
    {
      name: "a stale count goes back to the confirmation page with the stale code",
      albumId: () => target,
      matchups: 5,
      path: () => `/library/remove/${target}`,
      params: { error: "stale" },
      removed: false,
    },
    {
      name: "an album not in the library goes to the library",
      albumId: () => 9999,
      matchups: 0,
      path: "/library",
      params: {},
      removed: false,
    },
  ])("$name", async ({ albumId, matchups, path, params, removed }) => {
    const url = await redirectOf(removeAlbumAction(form(albumId(), matchups)));

    expect(url.pathname).toBe(typeof path === "function" ? path() : path);
    expect(Object.fromEntries(url.searchParams)).toEqual(params);
    expect(getAlbum(db, target) === undefined).toBe(removed);
  });
});
