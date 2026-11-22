import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memoryDb } from "@/lib/db/test-db";
import { createImportReviewItem } from "@/lib/db/import-review";
import { createAlbum } from "@/lib/db/albums";
import { addToLibrary } from "@/lib/db/library";
import { recordMatchup } from "@/lib/db/matchups";

const state = vi.hoisted(() => ({ db: undefined as unknown }));

vi.mock("@/lib/db/server", () => ({ getDb: () => state.db }));
vi.mock("next/server", () => ({ connection: async () => {} }));

import Home from "./page";

async function renderHome() {
  render(await Home());
}

describe("home page", () => {
  afterEach(cleanup);

  beforeEach(() => {
    state.db = memoryDb();
  });

  it("shows the Album ranker heading and the search link", async () => {
    await renderHome();

    expect(screen.getByRole("heading", { level: 1, name: "Album ranker" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Search albums" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Library" }).getAttribute("href")).toBe("/library");
    expect(screen.getByRole("link", { name: "Analytics" }).getAttribute("href")).toBe("/analytics");
  });

  it("describes each card with the same words as the nav", async () => {
    await renderHome();

    const cards = [
      ["Search albums", "Find an album in the catalog and add it to your library."],
      ["Library", "Browse, sort and filter every album you have added."],
      ["Matchups", "Pick the better of two albums to refine your ratings."],
      ["Analytics", "See album and artist rankings by lifetime, era, decade and year."],
    ];
    for (const [name, description] of cards) {
      expect(screen.getByRole("link", { name }).closest("li")!.textContent).toContain(description);
    }
  });

  it.each<{ name: string; albums: number; matchups: number; text: string }>([
    { name: "an empty library", albums: 0, matchups: 0, text: "Your library is empty. Search for an album to start." },
    {
      name: "one album, no matchups",
      albums: 1,
      matchups: 0,
      text: "Build a library, play matchups, read the rankings. 1 album in your library · 0 matchups played",
    },
    {
      name: "two albums, one matchup",
      albums: 2,
      matchups: 1,
      text: "Build a library, play matchups, read the rankings. 2 albums in your library · 1 matchup played",
    },
    {
      name: "many albums and matchups",
      albums: 4,
      matchups: 3,
      text: "Build a library, play matchups, read the rankings. 4 albums in your library · 3 matchups played",
    },
  ])("shows the library facts for $name", async ({ albums, matchups, text }) => {
    const db = state.db as ReturnType<typeof memoryDb>;
    const ids = Array.from({ length: albums }, (_, i) => {
      const album = createAlbum(db, { title: `Fake Album ${i}`, artist: { name: `Fake Artist ${i}` } });
      addToLibrary(db, { albumId: album.id, year: 2000 + i });
      return album.id;
    });
    for (let i = 0; i < matchups; i++) {
      recordMatchup(db, { albumAId: ids[0], albumBId: ids[1], result: "a" });
    }
    await renderHome();

    expect(screen.getByText(text)).toBeDefined();
  });

  it("has no import review link while nothing is open", async () => {
    await renderHome();

    expect(screen.queryByRole("link", { name: /Import review/ })).toBeNull();
  });

  it("links to the import review with the number of open items", async () => {
    const db = state.db as ReturnType<typeof memoryDb>;
    for (const title of ["Fake Album One", "Fake Album Two"]) {
      createImportReviewItem(db, {
        source: { title, artist: "Fake Artist A", year: 2001 },
        sourcePlacement: "listed",
        candidates: [],
      });
    }
    await renderHome();

    const link = screen.getByRole("link", { name: "Import review: 2 to check" });
    expect(link.getAttribute("href")).toBe("/import");
  });
});
