import { cleanup, render, screen, within } from "@testing-library/react";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAlbum } from "@/lib/db/albums";
import { createImportReviewItem, skipImportReviewItem } from "@/lib/db/import-review";
import { memoryDb } from "@/lib/db/test-db";
import { addYearEntry } from "@/lib/db/year-entries";

const state = vi.hoisted(() => ({ db: undefined as unknown }));

vi.mock("@/lib/db/server", () => ({ getDb: () => state.db }));
vi.mock("@/lib/catalog/search", () => ({ searchAlbums: vi.fn() }));
vi.mock("./actions", () => ({
  chooseAlbumAction: async () => {},
  keepManualAction: async () => {},
  skipAction: async () => {},
}));

import { searchAlbums } from "@/lib/catalog/search";
import ImportPage from "./page";

const searchAlbumsMock = vi.mocked(searchAlbums);

type Params = Record<string, string>;

async function renderPage(params: Params = {}) {
  render(await ImportPage({ searchParams: Promise.resolve(params) }));
}

const candidate = (catalogId: string, title: string, artist: string, releaseYear: number | null) => ({
  catalogId,
  title,
  artist,
  artistId: `artist-${artist}`,
  releaseYear,
  coverUrl: `https://covers.test/${catalogId}`,
});

function seed(db: DatabaseSync) {
  createImportReviewItem(db, {
    source: { title: "Fake Album Later", artist: "Fake Artist B", year: 2005 },
    sourcePlacement: "listed",
    reason: "no_match",
    candidates: [candidate("c-later", "Fake Album Latter", "Fake Artist B", 2005)],
  });
  createImportReviewItem(db, {
    source: { title: "Fake Album Early", artist: "Fake Artist A", year: 1990 },
    sourcePlacement: "ranked",
    sourceRank: 3,
    sourceDecadeRank: 7,
    reason: "ambiguous",
    candidates: [
      candidate("c-one", "Fake Album Early", "Fake Artist A", 1990),
      candidate("c-two", "Fake Album Early", "Fake Artist A", 1991),
    ],
  });
}

describe("import review page", () => {
  afterEach(cleanup);

  beforeEach(() => {
    state.db = memoryDb();
    searchAlbumsMock.mockReset();
  });

  it("lists open items oldest year first with the sheet row, reason and candidates", async () => {
    seed(state.db as DatabaseSync);
    await renderPage();

    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual([
      "Fake Album Early - Fake Artist A (1990), rank 3, decade rank 7",
      "Fake Album Later - Fake Artist B (2005), listed",
    ]);
    expect(screen.getByText("Several albums match. Pick the right one.")).toBeDefined();
    expect(screen.getByText("No match in the catalog.")).toBeDefined();
    expect(screen.getAllByText("Fake Album Early", { selector: "strong" })).toHaveLength(2);
    expect(screen.getByText("1991")).toBeDefined();
    expect(screen.getAllByRole("button", { name: "Use this album" })).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: "Keep as manual album" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Skip" })).toHaveLength(2);
    expect(screen.getByText("2 open, 0 resolved, 0 skipped")).toBeDefined();
  });

  it("prefills each search box with the album and artist", async () => {
    seed(state.db as DatabaseSync);
    await renderPage();

    const boxes = screen.getAllByRole("searchbox") as HTMLInputElement[];
    expect(boxes.map((box) => box.value)).toEqual(["Fake Album Early Fake Artist A", "Fake Album Later Fake Artist B"]);
  });

  it("names the year of a duplicate album match and the album holding a taken rank", async () => {
    const db = state.db as DatabaseSync;
    createImportReviewItem(db, {
      source: { title: "Fake Album Dup", artist: "Fake Artist C", year: 2001 },
      sourcePlacement: "listed",
      reason: "duplicate_album",
      reasonDetail: "1999",
      candidates: [candidate("c-dup", "Fake Album Dup", "Fake Artist C", 1999)],
    });
    createImportReviewItem(db, {
      source: { title: "Fake Album Taken", artist: "Fake Artist D", year: 2002 },
      sourcePlacement: "ranked",
      sourceRank: 1,
      reason: "rank_taken",
      reasonDetail: "Fake Album Holder - Fake Artist E",
      candidates: [candidate("c-taken", "Fake Album Taken", "Fake Artist D", 2002)],
    });
    await renderPage();

    expect(screen.getByText("The matched album is already on the 1999 year page.")).toBeDefined();
    expect(screen.getByText("Rank 1 in 2002 is already held by Fake Album Holder - Fake Artist E.")).toBeDefined();
  });

  it("offers Move it here for a candidate that is already on a year page", async () => {
    const db = state.db as DatabaseSync;
    const album = createAlbum(db, {
      title: "Fake Album Dup",
      artist: { name: "Fake Artist C", catalogId: "artist-Fake Artist C" },
      catalogId: "c-dup",
    });
    addYearEntry(db, { albumId: album.id, year: 1999, placement: "listed" });
    createImportReviewItem(db, {
      source: { title: "Fake Album Dup", artist: "Fake Artist C", year: 2001 },
      sourcePlacement: "listed",
      reason: "duplicate_album",
      reasonDetail: "1999",
      candidates: [candidate("c-dup", "Fake Album Dup", "Fake Artist C", 1999)],
    });
    await renderPage();

    expect(screen.getByText("Already on the 1999 year page.")).toBeDefined();
    expect(screen.getByRole("button", { name: "Move it here" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Use this album" })).toBeNull();
  });

  it("leaves resolved and skipped items off the list but counts them", async () => {
    const db = state.db as DatabaseSync;
    seed(db);
    const skipped = createImportReviewItem(db, {
      source: { title: "Fake Album Skip", artist: "Fake Artist F", year: 2003 },
      sourcePlacement: "listed",
      candidates: [],
    });
    skipImportReviewItem(db, skipped.id);
    await renderPage();

    expect(screen.queryByText(/Fake Album Skip/)).toBeNull();
    expect(screen.getByText("2 open, 0 resolved, 1 skipped")).toBeDefined();
  });

  it("shows search results under the searched item", async () => {
    const db = state.db as DatabaseSync;
    seed(db);
    searchAlbumsMock.mockResolvedValue({
      ok: true,
      albums: [{ catalogId: "s-1", title: "Fake Album Found", artist: "Fake Artist A", artistId: "a", year: 1990, coverUrl: "https://covers.test/s-1" }],
    });
    await renderPage({ search: "2", q: "fake found" });

    expect(searchAlbumsMock).toHaveBeenCalledWith("fake found");
    expect(screen.getByText("Fake Album Found")).toBeDefined();
    const box = screen.getAllByRole("searchbox")[0] as HTMLInputElement;
    expect(box.value).toBe("fake found");
  });

  it("shows a failed action's message with the item still listed", async () => {
    seed(state.db as DatabaseSync);
    await renderPage({ item: "2", error: "Rank 3 in 1990 is held by Fake Album Holder - Fake Artist E." });

    const item = screen.getByRole("heading", { name: /Fake Album Early/ }).closest("li") as HTMLElement;
    expect(within(item).getByRole("alert").textContent).toBe("Rank 3 in 1990 is held by Fake Album Holder - Fake Artist E.");
  });

  it("tells the user when a move removed decade list entries", async () => {
    await renderPage({ removed: "1", album: "Fake Album One" });

    expect(screen.getByRole("status").textContent).toBe(
      "Fake Album One no longer qualifies for a decade list, so 1 decade list entry was removed.",
    );
    expect(screen.getByText("Nothing to check.")).toBeDefined();
  });
});
