import { cleanup, render, screen, within } from "@testing-library/react";
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

type Db = ReturnType<typeof memoryDb>;

async function renderHome() {
  render(await Home());
}

/** Adds `count` library albums, with a matchup for each pair of neighbours until `matchups` are recorded. */
function seed(count: number, matchups = 0): number[] {
  const db = state.db as Db;
  const ids = Array.from({ length: count }, (_, i) => {
    const album = createAlbum(db, { title: `Fake Album ${i}`, artist: { name: `Fake Artist ${i}` } });
    addToLibrary(db, { albumId: album.id, year: 2000 + i });
    return album.id;
  });
  for (let i = 0; i < matchups; i++) {
    recordMatchup(db, { albumAId: ids[0], albumBId: ids[1], result: "a" });
  }
  return ids;
}

const section = (label: string) => screen.getByRole("region", { name: label });

describe("home page", () => {
  afterEach(cleanup);

  beforeEach(() => {
    state.db = memoryDb();
  });

  it("opens with the headline and the three numbered steps", async () => {
    seed(3);
    await renderHome();

    expect(screen.getByRole("heading", { level: 1, name: "Rank the albums you love." })).toBeDefined();
    const steps = screen.getAllByRole("heading", { level: 2 }).filter((h) => /^\d\d \//.test(h.textContent ?? ""));
    expect(steps.map((h) => h.textContent)).toEqual(["01 / Add albums", "02 / Play", "03 / Rankings"]);
  });

  it("searches the catalog with a GET form to /search", async () => {
    await renderHome();

    const box = within(section("01 / Add albums")).getByRole("searchbox", { name: "Album or artist" });
    expect(box.getAttribute("name")).toBe("q");
    expect(box.closest("form")!.getAttribute("action")).toBe("/search");
    expect(box.closest("form")!.getAttribute("method")).toBe("get");
    expect(within(section("01 / Add albums")).getByRole("link", { name: "View library" }).getAttribute("href")).toBe("/library");
  });

  describe("with an empty library", () => {
    it("says so, sends the user to add albums, and leaves out the cover strip and the rankings", async () => {
      await renderHome();

      expect(screen.getByText("Your library is empty. Search for an album to start.")).toBeDefined();
      expect(screen.queryByRole("list", { name: "Top albums" })).toBeNull();
      expect(screen.queryByRole("heading", { name: "03 / Rankings" })).toBeNull();
      expect(screen.queryByRole("link", { name: "See the rankings" })).toBeNull();
      const play = section("02 / Play");
      expect(within(play).getByText("Add at least two albums to your library to start matchups.")).toBeDefined();
      expect(within(play).getByRole("link", { name: "Search albums" }).getAttribute("href")).toBe("/search");
      expect(within(play).queryByRole("link", { name: "Play matchups" })).toBeNull();
    });
  });

  describe("with one album", () => {
    it("shows the album, still asks for a second one before matchups, and ranks it first", async () => {
      seed(1);
      await renderHome();

      expect(screen.getByText("1 album in your library · 0 matchups played")).toBeDefined();
      expect(screen.getAllByRole("img", { name: /Fake Album 0/ })).toHaveLength(2);
      expect(within(section("02 / Play")).getByText("Add at least two albums to your library to start matchups.")).toBeDefined();
      expect(screen.queryByRole("link", { name: "Play matchups" })).toBeNull();
      const top = within(section("03 / Rankings")).getAllByRole("listitem");
      expect(top).toHaveLength(1);
      expect(top[0].textContent).toContain("Fake Album 0");
    });
  });

  describe("with many albums", () => {
    it.each<{ name: string; albums: number; matchups: number; text: string }>([
      { name: "two albums, one matchup", albums: 2, matchups: 1, text: "2 albums in your library · 1 matchup played" },
      { name: "four albums, three matchups", albums: 4, matchups: 3, text: "4 albums in your library · 3 matchups played" },
    ])("shows the library facts for $name", async ({ albums, matchups, text }) => {
      seed(albums, matchups);
      await renderHome();

      expect(screen.getByText(text)).toBeDefined();
    });

    it("shows the progress with one play link, the cover strip, and the top five", async () => {
      seed(12, 2);
      await renderHome();

      const play = section("02 / Play");
      expect(within(play).getByRole("heading", { name: "Ranking progress" })).toBeDefined();
      expect(within(play).getAllByRole("link", { name: "Play matchups" })).toHaveLength(1);
      expect(within(play).getByRole("link", { name: "Play matchups" }).getAttribute("href")).toBe("/matchups");

      expect(within(screen.getByRole("list", { name: "Top albums" })).getAllByRole("listitem")).toHaveLength(8);
      const top = within(section("03 / Rankings")).getAllByRole("listitem");
      expect(top).toHaveLength(5);
      expect(within(section("03 / Rankings")).getByRole("link", { name: "See the rankings" }).getAttribute("href")).toBe("/analytics");
    });

    it("lists the top five in rating order, linking each artist", async () => {
      const [first, second] = seed(3);
      const db = state.db as Db;
      recordMatchup(db, { albumAId: first, albumBId: second, result: "b" });
      await renderHome();

      const top = within(section("03 / Rankings")).getAllByRole("listitem");
      expect(top.map((row) => within(row).getByRole("strong", { hidden: true }).textContent)).toEqual([
        "Fake Album 1",
        "Fake Album 2",
        "Fake Album 0",
      ]);
      expect(within(top[0]).getByRole("link", { name: "Fake Artist 1" }).getAttribute("href")).toMatch(/^\/artists\/\d+$/);
    });
  });

  describe("import review", () => {
    it("has no import review link while nothing is open", async () => {
      await renderHome();

      expect(screen.queryByRole("link", { name: /Import review/ })).toBeNull();
    });

    it("links to the import review with the number of open items", async () => {
      const db = state.db as Db;
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
});
