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
import { addYearEntry } from "@/lib/db/year-entries";
import ArtistsPage from "./page";

async function renderPage(decade?: string | string[]) {
  render(await ArtistsPage({ searchParams: Promise.resolve(decade === undefined ? {} : { decade }) }));
}

describe("artists page", () => {
  beforeEach(() => {
    state.db = memoryDb();
    const a = createAlbum(state.db, { title: "One", artist: { name: "Aardvark" } }).id;
    const b = createAlbum(state.db, { title: "Two", artist: { name: "Bear" } }).id;
    addYearEntry(state.db, { albumId: a, year: 1971, placement: "ranked", rank: 1 });
    addYearEntry(state.db, { albumId: b, year: 1985, placement: "honorable_mention" });
  });
  afterEach(cleanup);

  it("lists rank, artist link, rounded score and rated count, and marks Overall as current", async () => {
    await renderPage();

    const rows = screen.getAllByRole("row");
    expect(within(rows[0]).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Rank",
      "Artist",
      "Score",
      "Rated albums",
    ]);
    const cells = within(rows[1]).getAllByRole("cell");
    expect(cells.map((c) => c.textContent)).toEqual(["1", "Aardvark", "1500", "1"]);
    expect(within(cells[1]).getByRole("link").getAttribute("href")).toMatch(/^\/artists\/\d+$/);

    expect(screen.getByText("Overall").getAttribute("aria-current")).toBe("page");
    expect(screen.queryByRole("link", { name: "Overall" })).toBeNull();
    expect(screen.getByRole("link", { name: "1970s" }).getAttribute("href")).toBe("/artists?decade=1970");
  });

  it("scopes to a decade and marks it current", async () => {
    await renderPage("1980");

    expect(screen.getByText("1980s").getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Overall" }).getAttribute("href")).toBe("/artists");
    expect(screen.getByText("Bear")).toBeDefined();
    expect(screen.queryByText("Aardvark")).toBeNull();
  });

  it("says so when a decade has no rated albums", async () => {
    await renderPage("1950");

    expect(screen.getByText("No rated albums in the 1950s yet.")).toBeDefined();
    expect(screen.getByRole("link", { name: "Overall" })).toBeDefined();
  });

  it("says so when nothing is rated", async () => {
    state.db = memoryDb();
    await renderPage();

    expect(screen.getByText("No rated albums yet.")).toBeDefined();
  });

  it.each(["1975", "1940", "2030", "abc", "", ["1970", "1980"]])("calls notFound for decade %j", async (decade) => {
    await expect(renderPage(decade)).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
