import { cleanup, render, screen, within } from "@testing-library/react";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: undefined as unknown as DatabaseSync }));
vi.mock("@/lib/db/server", () => ({ getDb: () => state.db }));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import { createAlbum } from "@/lib/db/albums";
import { memoryDb } from "@/lib/db/test-db";
import { addToLibrary } from "@/lib/db/library";
import { recordMatchup } from "@/lib/db/matchups";
import ArtistPage from "./page";

async function renderPage(id: string) {
  render(await ArtistPage({ params: Promise.resolve({ id }) }));
}

describe("artist page", () => {
  let artistId: string;

  beforeEach(() => {
    const db = (state.db = memoryDb());
    const one = createAlbum(db, { title: "First", artist: { name: "Aardvark" } });
    const two = createAlbum(db, { title: "Second", artist: { name: "Aardvark" } });
    const three = createAlbum(db, { title: "Third", artist: { name: "Aardvark" } });
    createAlbum(db, { title: "Not in library", artist: { name: "Aardvark" } });
    addToLibrary(db, { albumId: one.id, year: 1971 });
    addToLibrary(db, { albumId: two.id, year: 1972 });
    addToLibrary(db, { albumId: three.id, year: 1973 });
    recordMatchup(db, { albumAId: one.id, albumBId: two.id, result: "a", createdAt: "2025-01-01T00:00:00.000Z" });
    recordMatchup(db, { albumAId: two.id, albumBId: one.id, result: "tie", createdAt: "2025-01-02T00:00:00.000Z" });
    artistId = String(one.artist.id);
  });
  afterEach(cleanup);

  it("shows the score line, each library album with its rating, and the link back", async () => {
    await renderPage(artistId);

    expect(screen.getByRole("heading", { level: 1, name: "Aardvark" })).toBeDefined();
    expect(screen.getByText("Score 1500 from 3 albums")).toBeDefined();
    expect(screen.queryAllByRole("listitem").map((item) => item.textContent)).toEqual([
      expect.stringContaining("First1971Rating 1515 · W-L-T 1-0-1"),
      expect.stringContaining("Second1972Rating 1485 · W-L-T 0-1-1"),
      expect.stringContaining("Third1973Rating 1500 · W-L-T 0-0-0"),
    ]);
    expect(within(screen.getByText("First").closest("li")!).getByText("1971")).toBeDefined();
    expect(screen.queryByText("Not in library")).toBeNull();
    expect(screen.getByRole("link", { name: "All artists" }).getAttribute("href")).toBe("/analytics?view=artists");
  });

  it("an artist with no albums in the library shows the empty state", async () => {
    state.db.exec("DELETE FROM library_albums");
    await renderPage(artistId);

    expect(screen.getByText("No albums in the library")).toBeDefined();
    expect(screen.getByText("No albums in the library.")).toBeDefined();
  });

  it.each(["9999", "abc", "1.5", "-1", "", "01"])("calls notFound for id %j", async (id) => {
    await expect(renderPage(id)).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
