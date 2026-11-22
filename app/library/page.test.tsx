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
import { addToLibrary } from "@/lib/db/library";
import { recordMatchup } from "@/lib/db/matchups";
import { memoryDb } from "@/lib/db/test-db";
import LibraryPage from "./page";

type Params = Record<string, string | string[]>;

async function renderPage(params: Params = {}) {
  render(await LibraryPage({ searchParams: Promise.resolve(params) }));
}

/** The album titles on the page, in order. */
function titles(): string[] {
  return screen.queryAllByRole("listitem").map((item) => within(item).getByRole("strong", { hidden: true }).textContent ?? "");
}

describe("library page", () => {
  beforeEach(() => {
    const db = (state.db = memoryDb());
    const add = (title: string, artist: string, year: number) => {
      const album = createAlbum(db, { title, artist: { name: artist } });
      addToLibrary(db, { albumId: album.id, year });
      return album.id;
    };
    const one = add("Alpha", "Aardvark", 1975);
    const two = add("Beta", "Bear", 1975);
    add("Gamma", "Aardvark", 1984);
    createAlbum(db, { title: "Not in library", artist: { name: "Bear" } });
    recordMatchup(db, { albumAId: one, albumBId: two, result: "a", createdAt: "2025-01-01T00:00:00.000Z" });
    recordMatchup(db, { albumAId: two, albumBId: one, result: "tie", createdAt: "2025-01-02T00:00:00.000Z" });
  });
  afterEach(cleanup);

  it("shows each card's cover, title, artist link, year, rating, rank and record, and the count", async () => {
    await renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "Library" })).toBeDefined();
    expect(screen.getByText("3 of 3 albums")).toBeDefined();
    expect(titles()).toEqual(["Alpha", "Gamma", "Beta"]);
    expect(screen.queryByText("Not in library")).toBeNull();

    const card = screen.getByText("Alpha").closest("li")!;
    expect(within(card).getByRole("link", { name: "Aardvark" }).getAttribute("href")).toMatch(/^\/artists\/\d+$/);
    expect(card.textContent).toContain("1975 · Rating 1515 · Rank 1 · W-L-T 1-0-1");
    expect(screen.getByText("Gamma").closest("li")!.textContent).toContain("1984 · Rating 1500 · Rank 2 · W-L-T 0-0-0");
    expect(screen.queryAllByRole("heading", { level: 2 })).toHaveLength(0);
  });

  it.each<{ name: string; params: Params; headings: string[]; order: string[] }>([
    {
      name: "year sort puts a divider heading above each year, newest first",
      params: { sort: "year" },
      headings: ["1984 · 1 album", "1975 · 2 albums"],
      order: ["Gamma", "Alpha", "Beta"],
    },
    {
      name: "artist sort groups by artist",
      params: { sort: "artist" },
      headings: ["Aardvark · 2 albums", "Bear · 1 album"],
      order: ["Alpha", "Gamma", "Beta"],
    },
    {
      name: "direction flips the main key",
      params: { sort: "year", dir: "asc" },
      headings: ["1975 · 2 albums", "1984 · 1 album"],
      order: ["Alpha", "Beta", "Gamma"],
    },
    { name: "title sort has no dividers", params: { sort: "title", dir: "desc" }, headings: [], order: ["Gamma", "Beta", "Alpha"] },
    { name: "last matchup puts an album with no matchup last, newest first", params: { sort: "lastmatchup" }, headings: [], order: ["Alpha", "Beta", "Gamma"] },
    { name: "a bad sort and direction fall back", params: { sort: "nope", dir: "sideways" }, headings: [], order: ["Alpha", "Gamma", "Beta"] },
    { name: "a bad played value falls back to all", params: { played: "maybe" }, headings: [], order: ["Alpha", "Gamma", "Beta"] },
    { name: "a repeated sort falls back", params: { sort: ["year", "title"] }, headings: [], order: ["Alpha", "Gamma", "Beta"] },
    { name: "q filters by title or artist", params: { q: "aardvark" }, headings: [], order: ["Alpha", "Gamma"] },
    { name: "scope filters by decade", params: { scope: "decade-1980" }, headings: [], order: ["Gamma"] },
    { name: "played filters to albums with a matchup", params: { played: "played" }, headings: [], order: ["Alpha", "Beta"] },
    { name: "unplayed filters to albums without one", params: { played: "unplayed" }, headings: [], order: ["Gamma"] },
  ])("$name", async ({ params, headings, order }) => {
    await renderPage(params);

    expect(screen.queryAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(headings);
    expect(titles()).toEqual(order);
  });

  it("shows the filtered count against the whole library", async () => {
    await renderPage({ q: "aardvark" });

    expect(screen.getByText("2 of 3 albums")).toBeDefined();
  });

  it("keeps the URL state in the form, which submits by GET", async () => {
    await renderPage({ sort: "year", dir: "asc", q: "bear", scope: "decade-1970", played: "played" });

    const form = screen.getByRole("button", { name: "Apply" }).closest("form")!;
    expect(form.getAttribute("method")).toBe("get");
    expect(form.getAttribute("action")).toBe("/library");
    expect((screen.getByLabelText("Sort by") as HTMLSelectElement).value).toBe("year");
    expect((screen.getByLabelText("Direction") as HTMLSelectElement).value).toBe("asc");
    expect((screen.getByLabelText("Title or artist") as HTMLInputElement).value).toBe("bear");
    expect((screen.getByLabelText("Scope") as HTMLSelectElement).value).toBe("decade-1970");
    expect((screen.getByLabelText("Matchups") as HTMLSelectElement).value).toBe("played");
  });

  it("says so when the filters match nothing, and when the library is empty", async () => {
    await renderPage({ q: "zzz" });
    expect(screen.getByText("No albums match these filters.")).toBeDefined();
    expect(screen.getByText("0 of 3 albums")).toBeDefined();
    cleanup();

    state.db = memoryDb();
    await renderPage();
    expect(screen.getByText("No albums in the library yet.")).toBeDefined();
  });

  it.each(["nope", "decade-1975", "year-1800", "era-90s", ["lifetime", "lifetime"], ""])("calls notFound for scope %j", async (scope) => {
    await expect(renderPage({ scope })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
