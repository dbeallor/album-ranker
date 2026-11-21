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
}));

import { createAlbum } from "@/lib/db/albums";
import { memoryDb } from "@/lib/db/test-db";
import { addYearEntry, removeYearEntry } from "@/lib/db/year-entries";
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
    createAlbum(db, { title: "Unplaced", artist: { name: "Aardvark" } });
    addYearEntry(db, { albumId: one.id, year: 1971, placement: "ranked", rank: 3 });
    addYearEntry(db, { albumId: two.id, year: 1972, placement: "honorable_mention" });
    addYearEntry(db, { albumId: three.id, year: 1973, placement: "listed" });
    artistId = String(one.artist.id);
  });
  afterEach(cleanup);

  it("shows the score line, placement and rating text, and the link back", async () => {
    await renderPage(artistId);

    expect(screen.getByRole("heading", { level: 1, name: "Aardvark" })).toBeDefined();
    expect(screen.getByText("Score 1500 from 2 rated albums")).toBeDefined();
    expect(screen.getByText("Ranked #3")).toBeDefined();
    expect(screen.getByText("Honorable mention")).toBeDefined();
    expect(screen.getByText("Listed")).toBeDefined();
    expect(screen.getByText("No rating")).toBeDefined();
    expect(screen.getAllByText("Rating 1500")).toHaveLength(2);
    expect(screen.queryByText("Unplaced")).toBeNull();
    expect(screen.getByRole("link", { name: "All artists" }).getAttribute("href")).toBe("/artists");
  });

  it("an artist whose albums lost their year entries shows the empty state", async () => {
    for (const id of [1, 2, 3]) removeYearEntry(state.db, id);
    await renderPage(artistId);

    expect(screen.getByText("No rated albums")).toBeDefined();
    expect(screen.getByText("No placed albums.")).toBeDefined();
  });

  it.each(["9999", "abc", "1.5", "-1", "", "01"])("calls notFound for id %j", async (id) => {
    await expect(renderPage(id)).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
