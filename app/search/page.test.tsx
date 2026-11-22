import { cleanup, render, screen } from "@testing-library/react";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: undefined as unknown as DatabaseSync }));
vi.mock("@/lib/db/server", () => ({ getDb: () => state.db }));
vi.mock("@/lib/catalog/search", () => ({ searchAlbums: vi.fn() }));
vi.mock("./actions", () => ({ addToLibraryAction: vi.fn() }));

import { searchAlbums } from "@/lib/catalog/search";
import { createAlbum } from "@/lib/db/albums";
import { addToLibrary } from "@/lib/db/library";
import { memoryDb } from "@/lib/db/test-db";
import { ADD_ALBUM_ERRORS } from "@/lib/library-service";
import SearchPage from "./page";

const searchAlbumsMock = vi.mocked(searchAlbums);

const GETZ = "11111111-1111-1111-1111-111111111111";
const UNDATED = "22222222-2222-2222-2222-222222222222";

async function renderPage(q?: string, extra: Record<string, string | string[]> = {}) {
  render(await SearchPage({ searchParams: Promise.resolve({ ...(q === undefined ? {} : { q }), ...extra }) }));
}

function twoResults() {
  searchAlbumsMock.mockResolvedValue({
    ok: true,
    albums: [
      { catalogId: GETZ, title: "Getz / Gilberto", artist: "Stan Getz", artistId: "s", year: 1964, coverUrl: "https://coverartarchive.org/a.jpg" },
      { catalogId: UNDATED, title: "Undated", artist: "Someone", artistId: null, year: null, coverUrl: "https://coverartarchive.org/b.jpg" },
    ],
  });
}

function addToLibraryAs(catalogId: string, year: number) {
  const album = createAlbum(state.db, { title: "Getz / Gilberto", artist: { name: "Stan Getz" }, catalogId });
  addToLibrary(state.db, { albumId: album.id, year });
}

describe("search page", () => {
  afterEach(cleanup);

  beforeEach(() => {
    searchAlbumsMock.mockReset();
    state.db = memoryDb();
  });

  it("shows the error message instead of crashing, and keeps the query in the box", async () => {
    searchAlbumsMock.mockResolvedValue({ ok: false, message: "The album catalog is busy. Try again in a moment." });
    await renderPage("getz gilberto");

    expect(screen.getByText("The album catalog is busy. Try again in a moment.")).toBeDefined();
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("getz gilberto");
  });

  it("shows results with title, artist and year", async () => {
    twoResults();
    await renderPage("getz");

    expect(screen.getByText("Getz / Gilberto")).toBeDefined();
    expect(screen.getByText("1964")).toBeDefined();
    expect(screen.getByText("Unknown year")).toBeDefined();
  });

  it("gives each result not in the library a year box (the catalog year, or empty with a hint) and an add button", async () => {
    twoResults();
    await renderPage("getz");

    const years = screen.getAllByLabelText("Year in your library") as HTMLInputElement[];
    expect(years.map((box) => box.value)).toEqual(["1964", ""]);
    expect(years.every((box) => box.required && box.min === "1900" && box.max === "2100")).toBe(true);
    expect(screen.getAllByText("The catalog has no year. Enter the year to file it under.")).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Add to library" })).toHaveLength(2);

    const form = years[0].closest("form")!;
    const hidden = Object.fromEntries([...form.querySelectorAll<HTMLInputElement>('input[type="hidden"]')].map((input) => [input.name, input.value]));
    expect(hidden).toEqual({
      q: "getz",
      catalogId: GETZ,
      title: "Getz / Gilberto",
      artist: "Stan Getz",
      artistId: "s",
      releaseYear: "1964",
    });
  });

  it("shows a result already in the library with its library year and no form", async () => {
    twoResults();
    addToLibraryAs(GETZ, 1964);
    await renderPage("getz");

    expect(screen.getByText("In your library (1964)")).toBeDefined();
    expect(screen.getAllByLabelText("Year in your library")).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Add to library" })).toHaveLength(1);
  });

  it.each([
    { name: "in the library", inLibrary: true, shown: true },
    { name: "not in the library", inLibrary: false, shown: false },
  ])("shows the added message only when the album is $name", async ({ inLibrary, shown }) => {
    twoResults();
    if (inLibrary) addToLibraryAs(GETZ, 1964);
    await renderPage("getz", { added: GETZ });

    expect(screen.queryByText("Added Getz / Gilberto to your library.") !== null).toBe(shown);
    expect(screen.queryByRole("link", { name: "View library" })?.getAttribute("href") ?? null).toBe(shown ? "/library?sort=year" : null);
    expect(screen.queryByRole("link", { name: "Play matchups" })?.getAttribute("href") ?? null).toBe(shown ? "/matchups" : null);
  });

  it.each([...Object.entries(ADD_ALBUM_ERRORS).map(([code, message]) => ({ code, message })), { code: "Your album is on fire.", message: null }, { code: "constructor", message: null }, { code: "", message: null }])(
    "shows the app's message for the error code '$code' under the result named by item only",
    async ({ code, message }) => {
      twoResults();
      await renderPage("getz", { error: code, item: UNDATED });

      const alert = screen.queryByRole("alert");
      expect(alert?.textContent ?? null).toBe(message);
      if (alert) expect(alert.closest("li")!.textContent).toContain("Undated");
      expect(document.body.textContent).not.toContain("on fire");
    },
  );

  it("says when nothing was found", async () => {
    searchAlbumsMock.mockResolvedValue({ ok: true, albums: [] });
    await renderPage("zzzz");

    expect(screen.getByText('No albums found for "zzzz".')).toBeDefined();
  });

  it("shows only the box when there is no query", async () => {
    await renderPage();

    expect(searchAlbumsMock).not.toHaveBeenCalled();
    expect(screen.getByRole("searchbox")).toBeDefined();
  });
});
