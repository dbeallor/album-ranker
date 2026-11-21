import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memoryDb } from "@/lib/db/test-db";
import { createImportReviewItem } from "@/lib/db/import-review";

const state = vi.hoisted(() => ({ db: undefined as unknown }));

vi.mock("@/lib/db/server", () => ({ getDb: () => state.db }));
vi.mock("next/server", () => ({ connection: async () => {} }));

import Home from "./page";

async function renderHome() {
  render(await Home());
}

describe("home page", () => {
  afterEach(cleanup);

  beforeEach(() => {
    state.db = memoryDb();
  });

  it("shows the Album ranker heading and the search link", async () => {
    await renderHome();

    expect(screen.getByRole("heading", { level: 1, name: "Album ranker" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Search albums" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Artists" }).getAttribute("href")).toBe("/artists");
  });

  it("has no import review link while nothing is open", async () => {
    await renderHome();

    expect(screen.queryByRole("link", { name: /Import review/ })).toBeNull();
  });

  it("links to the import review with the number of open items", async () => {
    const db = state.db as ReturnType<typeof memoryDb>;
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
