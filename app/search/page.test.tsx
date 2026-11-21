import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/catalog/search", () => ({ searchAlbums: vi.fn() }));

import { searchAlbums } from "@/lib/catalog/search";
import SearchPage from "./page";

const searchAlbumsMock = vi.mocked(searchAlbums);

async function renderPage(q?: string) {
  render(await SearchPage({ searchParams: Promise.resolve(q === undefined ? {} : { q }) }));
}

describe("search page", () => {
  afterEach(cleanup);

  beforeEach(() => {
    searchAlbumsMock.mockReset();
  });

  it("shows the error message instead of crashing, and keeps the query in the box", async () => {
    searchAlbumsMock.mockResolvedValue({ ok: false, message: "The album catalog is busy. Try again in a moment." });
    await renderPage("getz gilberto");

    expect(screen.getByText("The album catalog is busy. Try again in a moment.")).toBeDefined();
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("getz gilberto");
  });

  it("shows results with title, artist and year", async () => {
    searchAlbumsMock.mockResolvedValue({
      ok: true,
      albums: [
        { catalogId: "a", title: "Getz / Gilberto", artist: "Stan Getz", year: 1964, coverUrl: "https://example.test/a.jpg" },
        { catalogId: "b", title: "Undated", artist: "Someone", year: null, coverUrl: "https://example.test/b.jpg" },
      ],
    });
    await renderPage("getz");

    expect(screen.getByText("Getz / Gilberto")).toBeDefined();
    expect(screen.getByText("1964")).toBeDefined();
    expect(screen.getByText("Unknown year")).toBeDefined();
  });

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
