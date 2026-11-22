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
import AnalyticsPage from "./page";

type Params = Record<string, string | string[]>;

async function renderPage(params: Params = {}) {
  render(await AnalyticsPage({ searchParams: Promise.resolve(params) }));
}

/** Each body row of the one table as its cells (row header included) joined with "|". */
function rowTexts(): string[] {
  const table = screen.getByRole("table");
  return within(table)
    .getAllByRole("row")
    .slice(1)
    .map((row) => [...row.children].map((cell) => cell.textContent).join("|"));
}

describe("analytics page", () => {
  beforeEach(() => {
    const db = (state.db = memoryDb());
    const add = (title: string, artist: string, year: number) => {
      const album = createAlbum(db, { title, artist: { name: artist } });
      addToLibrary(db, { albumId: album.id, year });
      return album.id;
    };
    const alpha = add("Alpha", "Aardvark", 1975);
    const beta = add("Beta", "Bear", 1975);
    const gamma = add("Gamma", "Aardvark", 1984);
    createAlbum(db, { title: "Not in library", artist: { name: "Bear" } });
    recordMatchup(db, { albumAId: alpha, albumBId: beta, result: "a", createdAt: "2025-01-01T00:00:00.000Z" });
    recordMatchup(db, { albumAId: gamma, albumBId: beta, result: "tie", createdAt: "2025-01-02T00:00:00.000Z" });
  });
  afterEach(cleanup);

  it("defaults to the lifetime album ranking with rank, cover, title, artist link, year, rating, played and record", async () => {
    await renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "Rankings" })).toBeDefined();
    expect(screen.getByText("Album ranking · Lifetime")).toBeDefined();
    expect(rowTexts()).toEqual([
      "1|♪|Alpha|Aardvark|1975|1516|1|1-0-0",
      "2|♪|Gamma|Aardvark|1984|1499|1|0-0-1",
      "3|♪|Beta|Bear|1975|1485|2|0-1-1",
    ]);
    expect(within(screen.getByRole("table")).getByRole("link", { name: "Bear" }).getAttribute("href")).toMatch(/^\/artists\/\d+$/);
    expect(screen.queryByText("Not in library")).toBeNull();
  });

  it.each<{ name: string; params: Params; expected: string[] }>([
    { name: "an era", params: { view: "albums", scope: "era-60s-70s" }, expected: ["1|♪|Alpha|Aardvark|1975|1516|1|1-0-0", "2|♪|Beta|Bear|1975|1485|2|0-1-1"] },
    { name: "a decade", params: { scope: "decade-1980" }, expected: ["1|♪|Gamma|Aardvark|1984|1499|1|0-0-1"] },
    { name: "a year", params: { scope: "year-1975" }, expected: ["1|♪|Alpha|Aardvark|1975|1516|1|1-0-0", "2|♪|Beta|Bear|1975|1485|2|0-1-1"] },
    { name: "the old link's stray decade param is ignored", params: { decade: "1970", view: "artists", scope: "decade-1970" }, expected: ["1|Aardvark|1515|1|Alpha", "2|Bear|1500|1|Beta"] },
    { name: "an unknown view falls back to albums", params: { view: "nope" }, expected: ["1|♪|Alpha|Aardvark|1975|1516|1|1-0-0", "2|♪|Gamma|Aardvark|1984|1499|1|0-0-1", "3|♪|Beta|Bear|1975|1485|2|0-1-1"] },
    { name: "a repeated view falls back to albums", params: { view: ["years", "eras"] }, expected: ["1|♪|Alpha|Aardvark|1975|1516|1|1-0-0", "2|♪|Gamma|Aardvark|1984|1499|1|0-0-1", "3|♪|Beta|Bear|1975|1485|2|0-1-1"] },
    { name: "artists, lifetime", params: { view: "artists" }, expected: ["1|Aardvark|1515|2|Alpha", "2|Bear|1500|1|Beta"] },
    { name: "artists in a year", params: { view: "artists", scope: "year-1984" }, expected: ["1|Aardvark|1500|1|Gamma"] },
    {
      name: "years",
      params: { view: "years" },
      expected: ["1975|2|2|1500|Alpha|Aardvark", "1984|1|1|1499|Gamma|Aardvark"],
    },
    {
      name: "decades",
      params: { view: "decades" },
      expected: ["1970s|2|2|1500|Alpha|Aardvark", "1980s|1|1|1499|Gamma|Aardvark"],
    },
    {
      name: "eras, only those with albums",
      params: { view: "eras" },
      expected: ["60s and 70s|2|2|1500|Alpha|Aardvark", "80s and 90s|1|1|1499|Gamma|Aardvark"],
    },
  ])("shows $name", async ({ params, expected }) => {
    await renderPage(params);

    expect(rowTexts()).toEqual(expected);
  });

  it.each(["albums", "artists", "years", "decades", "eras"])("shows the ranking progress panel on the %s view", async (view) => {
    await renderPage({ view });

    const panel = screen.getByRole("region", { name: "Ranking progress" });
    expect(within(panel).getByText("4%")).toBeDefined();
    expect(within(panel).getByRole("progressbar", { name: "Ranking progress" })).toBeDefined();
    expect(within(panel).getByText("2 of about 43 matchups")).toBeDefined();
    expect(within(panel).getByText("About 41 more to go")).toBeDefined();
    expect(within(panel).getByText("Order confidence 68% · target 90%")).toBeDefined();
    expect(within(panel).getByRole("link", { name: "Play matchups" }).getAttribute("href")).toBe("/matchups");
  });

  it("shows the same panel under a scope", async () => {
    await renderPage();
    const lifetime = screen.getByRole("region", { name: "Ranking progress" }).textContent;
    cleanup();

    await renderPage({ scope: "year-1975" });

    expect(screen.getByRole("region", { name: "Ranking progress" }).textContent).toBe(lifetime);
  });

  it("shows an empty state instead of the panel with fewer than two library albums", async () => {
    const db = (state.db = memoryDb());
    addToLibrary(db, { albumId: createAlbum(db, { title: "Only", artist: { name: "One" } }).id, year: 1975 });
    await renderPage();

    expect(screen.getByText("Add at least two albums to your library to track ranking progress.")).toBeDefined();
    expect(screen.queryByRole("region", { name: "Ranking progress" })).toBeNull();
    expect(document.body.textContent).not.toContain("NaN");
  });

  it("links each summary period to that scope's album ranking", async () => {
    await renderPage({ view: "decades" });

    expect(screen.getByRole("link", { name: "1970s" }).getAttribute("href")).toBe("/analytics?view=albums&scope=decade-1970");
  });

  it("marks the current view and scope and links the rest", async () => {
    await renderPage({ view: "artists", scope: "era-80s-90s" });

    const views = screen.getByRole("navigation", { name: "Analytics view" });
    expect(within(views).getByText("Artists").getAttribute("aria-current")).toBe("page");
    expect(within(views).getByRole("link", { name: "Albums" }).getAttribute("href")).toBe("/analytics?view=albums&scope=era-80s-90s");
    expect(within(views).getByRole("link", { name: "Years" }).getAttribute("href")).toBe("/analytics?view=years");

    const scopes = screen.getByRole("navigation", { name: "Scope" });
    expect(within(scopes).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Lifetime",
      "Pre-60s",
      "60s and 70s",
      "80s and 90s",
      "00s and after",
    ]);
    expect(within(scopes).getByText("80s and 90s").getAttribute("aria-current")).toBe("page");
    expect(within(scopes).getByRole("link", { name: "Lifetime" }).getAttribute("href")).toBe("/analytics?view=artists&scope=lifetime");
  });

  it("lists only decades and years with albums, in GET forms that keep the view", async () => {
    await renderPage({ view: "artists", scope: "year-1975" });

    const decade = screen.getByLabelText("Decade") as HTMLSelectElement;
    const year = screen.getByLabelText("Year") as HTMLSelectElement;
    expect([...decade.options].map((option) => option.textContent)).toEqual(["Choose", "1970s", "1980s"]);
    expect([...year.options].map((option) => option.textContent)).toEqual(["Choose", "1975", "1984"]);
    expect(year.value).toBe("year-1975");
    expect(decade.value).toBe("");
    for (const select of [decade, year]) {
      const form = select.closest("form")!;
      expect(form.getAttribute("method")).toBe("get");
      expect(form.getAttribute("action")).toBe("/analytics");
      expect((form.querySelector('input[name="view"]') as HTMLInputElement).value).toBe("artists");
      expect(select.name).toBe("scope");
    }
  });

  it.each<{ view: string; labels: string[] }>([
    { view: "albums", labels: ["Show", "Period"] },
    { view: "artists", labels: ["Show", "Period"] },
    { view: "years", labels: ["Show"] },
    { view: "eras", labels: ["Show"] },
  ])("labels each row of tabs: $view view shows $labels", async ({ view, labels }) => {
    await renderPage({ view });

    expect(screen.getAllByText(/^(Show|Period)$/, { selector: "p" }).map((label) => label.textContent)).toEqual(labels);
  });

  it("has no scope tabs or pickers on a summary view", async () => {
    await renderPage({ view: "years" });

    expect(screen.queryByRole("navigation", { name: "Scope" })).toBeNull();
    expect(screen.queryByLabelText("Decade")).toBeNull();
  });

  it.each<{ params: Params; message: string; href: string }>([
    { params: { scope: "year-1999" }, message: "No albums in 1999 yet.", href: "/analytics?view=albums" },
    { params: { view: "artists", scope: "era-pre-60s" }, message: "No albums in Pre-60s yet.", href: "/analytics?view=artists" },
    { params: { scope: "decade-1990" }, message: "No albums in 1990s yet.", href: "/analytics?view=albums" },
  ])("says so when the scope has no albums and offers lifetime: $message", async ({ params, message, href }) => {
    await renderPage(params);

    expect(screen.getByText(message)).toBeDefined();
    expect(screen.getByRole("link", { name: "Show lifetime" }).getAttribute("href")).toBe(href);
    expect(screen.queryByRole("table")).toBeNull();
  });

  it.each(["albums", "artists", "years", "decades", "eras"])(
    "says the library is empty for the %s view and links to search",
    async (view) => {
      state.db = memoryDb();
      await renderPage({ view });

      expect(screen.getByText("No albums in the library yet.")).toBeDefined();
      expect(screen.getByRole("link", { name: "Search albums" }).getAttribute("href")).toBe("/search");
    },
  );

  it.each(["nope", "decade-1975", "year-1800", "era-90s", ["lifetime", "lifetime"], ""])("calls notFound for scope %j", async (scope) => {
    await expect(renderPage({ scope })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
