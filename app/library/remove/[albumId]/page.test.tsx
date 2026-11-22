import { cleanup, render, screen } from "@testing-library/react";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: undefined as unknown as DatabaseSync }));
vi.mock("@/lib/db/server", () => ({ getDb: () => state.db }));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: () => {},
}));

import { createAlbum } from "@/lib/db/albums";
import { addToLibrary } from "@/lib/db/library";
import { recordMatchup } from "@/lib/db/matchups";
import { memoryDb } from "@/lib/db/test-db";
import RemoveAlbumPage from "./page";

async function renderPage(albumId: string, error?: string) {
  render(await RemoveAlbumPage({ params: Promise.resolve({ albumId }), searchParams: Promise.resolve(error ? { error } : {}) }));
}

describe("remove album page", () => {
  let target: number;
  let outsider: number;

  /** Gives the target album `count` matchups against a second library album. */
  function play(count: number) {
    const opponent = createAlbum(state.db, { title: "Opponent", artist: { name: "Other" } });
    addToLibrary(state.db, { albumId: opponent.id, year: 1960 });
    for (let i = 0; i < count; i++) {
      recordMatchup(state.db, { albumAId: target, albumBId: opponent.id, result: "a", createdAt: `2025-01-0${i + 1}T00:00:00.000Z` });
    }
  }

  beforeEach(() => {
    const db = (state.db = memoryDb());
    target = createAlbum(db, { title: "Kind of Blue", artist: { name: "Miles Davis" } }).id;
    addToLibrary(db, { albumId: target, year: 1959 });
    outsider = createAlbum(db, { title: "Not in library", artist: { name: "Bear" } }).id;
  });
  afterEach(cleanup);

  it.each([
    { matchups: 0, line: "Miles Davis · 1959 · 0 matchups", body: "This deletes the album. It has no matchups. This can't be undone." },
    {
      matchups: 1,
      line: "Miles Davis · 1959 · 1 matchup",
      body: "This deletes the album and its 1 matchup. The ratings of the albums it played will change. This can't be undone.",
    },
    {
      matchups: 3,
      line: "Miles Davis · 1959 · 3 matchups",
      body: "This deletes the album and its 3 matchups. The ratings of the albums it played will change. This can't be undone.",
    },
  ])("words $matchups matchups", async ({ matchups, line, body }) => {
    play(matchups);
    await renderPage(String(target));

    expect(screen.getByRole("heading", { level: 1, name: "Remove Kind of Blue from your library?" })).toBeDefined();
    expect(screen.getByText(line)).toBeDefined();
    expect(screen.getByText(body)).toBeDefined();
  });

  it("posts the album id and the count it showed, and links back to the library", async () => {
    play(2);
    await renderPage(String(target));

    const form = screen.getByRole("button", { name: "Remove album" }).closest("form")!;
    expect((form.querySelector('input[name="albumId"]') as HTMLInputElement).value).toBe(String(target));
    expect((form.querySelector('input[name="matchups"]') as HTMLInputElement).value).toBe("2");
    expect(screen.getByRole("link", { name: "Keep it" }).getAttribute("href")).toBe("/library");
  });

  it("shows an error from the action", async () => {
    await renderPage(String(target), "This album now has 4 matchups. Check and confirm again.");

    expect(screen.getByRole("alert").textContent).toBe("This album now has 4 matchups. Check and confirm again.");
  });

  it.each([
    { name: "an album not in the library", id: () => String(outsider) },
    { name: "an unknown album", id: () => "9999" },
    { name: "a text id", id: () => "abc" },
    { name: "zero", id: () => "0" },
    { name: "a negative id", id: () => "-1" },
    { name: "a decimal id", id: () => "1.5" },
    { name: "a leading-zero id", id: () => "01" },
  ])("calls notFound for $name", async ({ id }) => {
    await expect(renderPage(id())).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
