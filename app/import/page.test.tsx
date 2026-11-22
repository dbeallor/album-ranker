import { cleanup, render, screen, within } from "@testing-library/react";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAlbum } from "@/lib/db/albums";
import { createImportReviewItem, skipImportReviewItem } from "@/lib/db/import-review";
import { resolveReviewItem, skipReviewItem } from "@/lib/import/resolve";
import { memoryDb } from "@/lib/db/test-db";
import { addToLibrary } from "@/lib/db/library";

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

  it("names the year of a duplicate album match and explains a rank taken in an old item", async () => {
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

    expect(screen.getByText("The matched album is already in your library (1999).")).toBeDefined();
    expect(screen.getByText("Sent to review for a rank clash. Ranks are no longer used, so any choice adds the album to your library.")).toBeDefined();
  });

  it("offers Move it here for a candidate that is already in the library", async () => {
    const db = state.db as DatabaseSync;
    const album = createAlbum(db, {
      title: "Fake Album Dup",
      artist: { name: "Fake Artist C", catalogId: "artist-Fake Artist C" },
      catalogId: "c-dup",
    });
    addToLibrary(db, { albumId: album.id, year: 1999 });
    createImportReviewItem(db, {
      source: { title: "Fake Album Dup", artist: "Fake Artist C", year: 2001 },
      sourcePlacement: "listed",
      reason: "duplicate_album",
      reasonDetail: "1999",
      candidates: [candidate("c-dup", "Fake Album Dup", "Fake Artist C", 1999)],
    });
    await renderPage();

    expect(screen.getByText("In your library (1999).")).toBeDefined();
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

    expect(searchAlbumsMock).toHaveBeenCalledWith({ kind: "text", text: "fake found" });
    expect(screen.getByText("Fake Album Found")).toBeDefined();
    const box = screen.getAllByRole("searchbox")[0] as HTMLInputElement;
    expect(box.value).toBe("fake found");
  });

  it("shows a failed catalog search's message under the searched item", async () => {
    seed(state.db as DatabaseSync);
    searchAlbumsMock.mockResolvedValue({ ok: false, message: "The album catalog is busy. Try again in a moment." });
    await renderPage({ search: "2", q: "fake found" });

    expect(screen.getByRole("alert").textContent).toBe("The album catalog is busy. Try again in a moment.");
  });

  it("runs the default search from the search box, and gives each item an anchor", async () => {
    seed(state.db as DatabaseSync);
    searchAlbumsMock.mockResolvedValue({
      ok: true,
      albums: [{ catalogId: "s-1", title: "Fake Album Early", artist: "Fake Artist A", artistId: "a", year: 1990, coverUrl: "https://covers.test/s-1" }],
    });
    await renderPage({ search: "2", q: "Fake Album Early Fake Artist A" });

    expect(searchAlbumsMock).toHaveBeenCalledWith({ kind: "text", text: "Fake Album Early Fake Artist A" });
    expect(screen.getAllByRole("heading", { level: 3 })[0].closest("li")?.id).toBe("item-2");
    const form = screen.getAllByRole("searchbox")[0].closest("form") as HTMLFormElement;
    expect(form.getAttribute("action")).toBe("/import#item-2");
  });

  describe("after an action", () => {
    function resolved(db: DatabaseSync, id: number) {
      expect(resolveReviewItem(db, id, { kind: "manual" }).ok).toBe(true);
    }

    it("says what was added and how many are left", async () => {
      const db = state.db as DatabaseSync;
      seed(db);
      resolved(db, 2);
      await renderPage({ done: "2" });

      const status = screen.getByRole("status");
      expect(status.textContent).toBe("Added Fake Album Early (1990) to your library. 1 left.");
      expect(screen.getByText("1 left", { selector: "p" })).toBeDefined();
    });

    it("says what was moved", async () => {
      const db = state.db as DatabaseSync;
      const album = createAlbum(db, { title: "Fake Album Dup", artist: { name: "Fake Artist C" }, catalogId: "c-dup" });
      addToLibrary(db, { albumId: album.id, year: 1999 });
      const item = createImportReviewItem(db, {
        source: { title: "Fake Album Dup", artist: "Fake Artist C", year: 2001 },
        sourcePlacement: "listed",
        reason: "duplicate_album",
        reasonDetail: "1999",
        candidates: [candidate("c-dup", "Fake Album Dup", "Fake Artist C", 1999)],
      });
      expect(resolveReviewItem(db, item.id, { kind: "catalog", album: item.candidates[0], moveHere: true }).ok).toBe(true);
      await renderPage({ done: String(item.id), moved: "1" });

      expect(screen.getByRole("status").textContent).toBe("Moved Fake Album Dup to 2001. 0 left.");
    });

    it("says what was skipped", async () => {
      const db = state.db as DatabaseSync;
      seed(db);
      expect(skipReviewItem(db, 1).ok).toBe(true);
      await renderPage({ done: "1" });

      expect(screen.getByRole("status").textContent).toBe("Skipped Fake Album Later. 1 left.");
    });

    it("says an item was already handled, without an error", async () => {
      const db = state.db as DatabaseSync;
      seed(db);
      resolved(db, 2);
      await renderPage({ done: "2", already: "1" });

      expect(screen.getByRole("status").textContent).toBe("Fake Album Early was already handled. 1 left.");
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("shows no message for an item that is still open or unknown", async () => {
      seed(state.db as DatabaseSync);
      await renderPage({ done: "2" });
      expect(screen.queryByRole("status")).toBeNull();
      cleanup();
      await renderPage({ done: "99" });
      expect(screen.queryByRole("status")).toBeNull();
    });
  });

  it("lists stored candidates in ranking order, closest year first", async () => {
    createImportReviewItem(state.db as DatabaseSync, {
      source: { title: "Fake Album Rank", artist: "Fake Artist G", year: 1967 },
      sourcePlacement: "listed",
      reason: "ambiguous",
      candidates: [
        candidate("c-late", "Fake Album Rank", "Fake Artist G", 1975),
        candidate("c-none", "Something Else", "Fake Artist G", 1967),
        candidate("c-near", "Fake Album Rank", "Fake Artist G", 1967),
      ],
    });
    await renderPage();

    const titles = screen.getAllByText(/^(Fake Album Rank|Something Else)$/, { selector: "strong" });
    const years = screen.getAllByText(/^\d{4}$/, { selector: "span" });
    expect(titles.map((t) => t.textContent)).toEqual(["Fake Album Rank", "Fake Album Rank", "Something Else"]);
    expect(years.map((y) => y.textContent)).toEqual(["1967", "1975", "1967"]);
  });

  it("names the gap when a candidate's year is more than a year off, and an unknown year", async () => {
    createImportReviewItem(state.db as DatabaseSync, {
      source: { title: "Fake Album Year", artist: "Fake Artist H", year: 1967 },
      sourcePlacement: "listed",
      reason: "ambiguous",
      candidates: [
        candidate("c-1", "Fake Album Year", "Fake Artist H", 1964),
        candidate("c-2", "Fake Album Year", "Fake Artist H", 1968),
        candidate("c-3", "Fake Album Year", "Fake Artist H", null),
      ],
    });
    await renderPage();

    expect(screen.getByText("Sheet says 1967, 3 years off")).toBeDefined();
    expect(screen.getAllByText(/years? off/)).toHaveLength(1);
    expect(screen.getByText("Unknown year")).toBeDefined();
  });

  describe("a failed action's code", () => {
    function inLibrary() {
      const album = createAlbum(state.db as DatabaseSync, { title: "Fake Album Held", artist: { name: "Fake Artist E" } });
      addToLibrary(state.db as DatabaseSync, { albumId: album.id, year: 1988 });
      return String(album.id);
    }

    const cases: { name: string; error: string; album?: () => string; text: string | null }[] = [
      { name: "not_found", error: "not_found", text: "That review item could not be found." },
      { name: "missing_details", error: "missing_details", text: "That album is missing its catalog details." },
      { name: "invalid", error: "invalid", text: "That album couldn't be saved. Check its details and try again." },
      { name: "in_library names the album and its year", error: "in_library", album: inLibrary, text: "Fake Album Held is already in your library (1988)." },
      { name: "in_library with an album that is gone", error: "in_library", album: () => "999", text: "That album is already in your library." },
      { name: "in_library with a bad album id", error: "in_library", album: () => "abc", text: "That album is already in your library." },
      { name: "made-up text", error: "Rank 3 in 1990 is held by Fake Album Holder.", text: null },
      { name: "an inherited property name", error: "constructor", text: null },
      { name: "empty", error: "", text: null },
    ];

    it.each(cases)("under the item: $name", async ({ error, album, text }) => {
      seed(state.db as DatabaseSync);
      await renderPage({ item: "2", error, ...(album ? { album: album() } : {}) });

      const item = screen.getByRole("heading", { name: /Fake Album Early/ }).closest("li") as HTMLElement;
      expect(within(item).queryByRole("alert")?.textContent ?? null).toBe(text);
      expect(screen.queryAllByRole("alert")).toHaveLength(text === null ? 0 : 1);
    });

    it.each(cases)("at the top of the page when the item is not open: $name", async ({ error, album, text }) => {
      seed(state.db as DatabaseSync);
      await renderPage({ item: "99", error, ...(album ? { album: album() } : {}) });

      expect(screen.queryAllByRole("alert").map((alert) => alert.textContent)).toEqual(text === null ? [] : [text]);
    });
  });
});
