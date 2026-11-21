import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CatalogAlbum } from "@/lib/catalog/types";
import type { AddResult, YearActionResult, YearAlbum, YearView } from "@/lib/year-service";
import type { Placements } from "@/lib/year-placements";
import { YearScreen } from "./year-screen";

const album = (id: number, rating: number | null = 1500): YearAlbum => ({
  id,
  title: `Album ${id}`,
  artist: `Artist ${id}`,
  coverUrl: null,
  rating,
});

/** What the server would return for these placements: ranks 1..n and ratings from position (the real replay isn't under test here). */
function viewOf(placements: Placements, year = 1987): YearView {
  return {
    year,
    ranked: placements.ranked.map((id, i) => ({ ...album(id, 1600 - i), rank: i + 1 })),
    honorableMentions: placements.honorableMentions.map((id) => album(id, 1450)),
    listed: placements.listed.map((id) => album(id, null)),
  };
}

const empty: Placements = { ranked: [], honorableMentions: [], listed: [] };

const found: CatalogAlbum = {
  catalogId: "mbid-9",
  title: "Found Album",
  artist: "Found Artist",
  year: 1987,
  coverUrl: "https://coverartarchive.org/release-group/mbid-9/front-250",
};

type Options = {
  placements?: Placements;
  view?: YearView;
  save?: (year: number, placements: Placements) => Promise<YearActionResult>;
  addCatalog?: (year: number, album: CatalogAlbum, area: string, move: boolean) => Promise<AddResult>;
};

function setup({ placements = empty, view, save, addCatalog }: Options = {}) {
  const saveAction = vi.fn(save ?? (async (_year: number, next: Placements) => ({ view: viewOf(next), removedDecadeEntries: [] })));
  const searchAction = vi.fn(async () => ({ ok: true as const, albums: [found] }));
  const addCatalogAction = vi.fn(
    addCatalog ??
      (async (_year: number, _album: CatalogAlbum, area: string) => ({
        view: viewOf({
          ...placements,
          ...(area === "ranked"
            ? { ranked: [...placements.ranked, 9] }
            : area === "honorable_mention"
              ? { honorableMentions: [...placements.honorableMentions, 9] }
              : { listed: [...placements.listed, 9] }),
        }),
        removedDecadeEntries: [],
      })),
  );
  const addManualAction = vi.fn(async () => ({
    view: viewOf({ ...placements, listed: [...placements.listed, 9] }),
    removedDecadeEntries: [],
  }));
  render(
    <YearScreen
      initial={view ?? viewOf(placements)}
      saveAction={saveAction}
      searchAction={searchAction}
      addCatalogAction={addCatalogAction}
      addManualAction={addManualAction}
    />,
  );
  return { saveAction, searchAction, addCatalogAction, addManualAction };
}

const rankedRegion = () => within(screen.getByRole("region", { name: "Ranked" }));
const card = (title: string) => screen.getByRole("group", { name: title });
const slotTitles = () =>
  rankedRegion()
    .getAllByRole("listitem")
    .map((slot) => within(slot).queryByRole("group")?.getAttribute("aria-label") ?? "Empty");

async function search() {
  fireEvent.change(screen.getByRole("searchbox", { name: "Album or artist" }), { target: { value: "found" } });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  return screen.findByText("Found Album");
}

describe("year screen", () => {
  afterEach(cleanup);

  it("a year with 3 ranked albums shows 7 empty slots, and the empty areas say so", () => {
    setup({ placements: { ...empty, ranked: [1, 2, 3] } });

    expect(slotTitles()).toEqual(["Album 1", "Album 2", "Album 3", ...Array(7).fill("Empty")]);
    expect(screen.getByText("No honorable mentions yet")).toBeDefined();
    expect(screen.getByText("No listed albums yet")).toBeDefined();
    expect(screen.queryByText(/No albums for/)).toBeNull();
  });

  it("a year with no albums says to search below", () => {
    setup();
    expect(screen.getByText("No albums for 1987 yet. Search below to add one.")).toBeDefined();
  });

  it("shows ratings on ranked and honorable mention cards and none on listed ones", () => {
    setup({ placements: { ranked: [1], honorableMentions: [2], listed: [3] } });

    expect(within(card("Album 1")).getByText("Rating 1600")).toBeDefined();
    expect(within(card("Album 2")).getByText("Rating 1450")).toBeDefined();
    expect(within(card("Album 3")).queryByText(/Rating/)).toBeNull();
  });

  it("a stored gap in the ranks shows as an empty slot", () => {
    const view: YearView = { ...viewOf({ ...empty, ranked: [1, 2, 3] }), ranked: [1, 2, 3].map((id, i) => ({ ...album(id), rank: [1, 2, 4][i] })) };
    setup({ view, placements: { ...empty, ranked: [1, 2, 3] } });

    expect(slotTitles().slice(0, 4)).toEqual(["Album 1", "Album 2", "Empty", "Album 3"]);
  });

  it.each([
    { area: "ranked", button: "Add to ranked", inRegion: () => rankedRegion() },
    { area: "honorable_mention", button: "Add to honorable mentions", inRegion: () => within(screen.getByRole("region", { name: "Honorable mentions" })) },
    { area: "listed", button: "Add to listed", inRegion: () => within(screen.getByRole("region", { name: "Listed" })) },
  ])("searching and adding to $area shows the album there", async ({ area, button, inRegion }) => {
    const { addCatalogAction } = setup();
    const title = await search();

    fireEvent.click(within(title.closest("li")!).getByRole("button", { name: button }));

    await waitFor(() => expect(inRegion().getByRole("group", { name: "Album 9" })).toBeDefined());
    expect(addCatalogAction).toHaveBeenCalledWith(1987, found, area, false);
  });

  it("reorders with the move buttons and saves the new order", async () => {
    const { saveAction } = setup({ placements: { ...empty, ranked: [1, 2, 3] } });

    fireEvent.click(within(card("Album 3")).getByRole("button", { name: "Move up" }));
    expect(slotTitles().slice(0, 3)).toEqual(["Album 1", "Album 3", "Album 2"]);
    await waitFor(() => expect(saveAction).toHaveBeenCalledWith(1987, { ...empty, ranked: [1, 3, 2] }));

    fireEvent.click(within(card("Album 1")).getByRole("button", { name: "Move down" }));
    await waitFor(() => expect(saveAction).toHaveBeenLastCalledWith(1987, { ...empty, ranked: [3, 1, 2] }));
  });

  it("disables Move up on rank 1 and Move down on the last rank", () => {
    setup({ placements: { ...empty, ranked: [1, 2] } });

    expect((within(card("Album 1")).getByRole("button", { name: "Move up" }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(card("Album 2")).getByRole("button", { name: "Move down" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it.each([
    { from: "ranked", to: "honorable_mention", expected: { ranked: [2], honorableMentions: [1], listed: [] } },
    { from: "ranked", to: "listed", expected: { ranked: [2], honorableMentions: [], listed: [1] } },
    { from: "honorable_mention", to: "ranked", expected: { ranked: [2, 1], honorableMentions: [], listed: [] } },
    { from: "honorable_mention", to: "listed", expected: { ranked: [2], honorableMentions: [], listed: [1] } },
    { from: "listed", to: "ranked", expected: { ranked: [2, 1], honorableMentions: [], listed: [] } },
    { from: "listed", to: "honorable_mention", expected: { ranked: [2], honorableMentions: [1], listed: [] } },
  ])("the Move to menu moves a card from $from to $to", async ({ from, to, expected }) => {
    const start: Placements = {
      ranked: from === "ranked" ? [1, 2] : [2],
      honorableMentions: from === "honorable_mention" ? [1] : [],
      listed: from === "listed" ? [1] : [],
    };
    const { saveAction } = setup({ placements: start });

    fireEvent.change(within(card("Album 1")).getByRole("combobox", { name: "Move to" }), { target: { value: to } });

    await waitFor(() => expect(saveAction).toHaveBeenCalledWith(1987, expected));
  });

  it("the Move to menu offers only the other two areas", () => {
    setup({ placements: { ...empty, honorableMentions: [1] } });
    const options = within(within(card("Album 1")).getByRole("combobox", { name: "Move to" })).getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual(["Move to…", "Ranked", "Listed"]);
  });

  it("Remove drops the album from the page and saves without it", async () => {
    const { saveAction } = setup({ placements: { ranked: [1], honorableMentions: [2], listed: [] } });

    fireEvent.click(within(card("Album 2")).getByRole("button", { name: "Remove" }));

    expect(screen.queryByRole("group", { name: "Album 2" })).toBeNull();
    await waitFor(() => expect(saveAction).toHaveBeenCalledWith(1987, { ...empty, ranked: [1] }));
  });

  it("moving an album into a full ranked list pushes rank 10 to honorable mentions and says so", async () => {
    const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const { saveAction } = setup({ placements: { ranked: ids, honorableMentions: [], listed: [11] } });

    fireEvent.change(within(card("Album 11")).getByRole("combobox", { name: "Move to" }), { target: { value: "ranked" } });

    expect(screen.getByText("Album 10 moved to honorable mentions")).toBeDefined();
    await waitFor(() =>
      expect(saveAction).toHaveBeenCalledWith(1987, { ranked: [1, 2, 3, 4, 5, 6, 7, 8, 9, 11], honorableMentions: [10], listed: [] }),
    );
  });

  it("disables Add to ranked, with a hint, when ranked is full", async () => {
    setup({ placements: { ...empty, ranked: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] } });
    const title = await search();

    const result = within(title.closest("li")!);
    expect((result.getByRole("button", { name: "Add to ranked" }) as HTMLButtonElement).disabled).toBe(true);
    expect((result.getByRole("button", { name: "Add to honorable mentions" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText("Ranked is full: add to honorable mentions or move one out first.")).toBeDefined();
  });

  it("an album on another year asks to move it; Move adds it here", async () => {
    const { addCatalogAction } = setup({
      addCatalog: async (_year, _album, _area, move) =>
        move
          ? { view: viewOf({ ...empty, ranked: [9] }), removedDecadeEntries: [] }
          : { conflict: { year: 1985, placement: "ranked", rank: 3, title: "Found Album" } },
    });
    const title = await search();
    fireEvent.click(within(title.closest("li")!).getByRole("button", { name: "Add to ranked" }));

    expect(await screen.findByText("Found Album is on 1985 (rank 3). Move it to 1987?")).toBeDefined();
    expect(screen.queryByRole("group", { name: "Album 9" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Move" }));

    await waitFor(() => expect(card("Album 9")).toBeDefined());
    expect(addCatalogAction).toHaveBeenLastCalledWith(1987, found, "ranked", true);
    expect(screen.queryByText(/Move it to 1987/)).toBeNull();
  });

  it("Cancel on the move prompt changes nothing", async () => {
    const { addCatalogAction } = setup({
      addCatalog: async () => ({ conflict: { year: 1985, placement: "listed", rank: null, title: "Found Album" } }),
    });
    const title = await search();
    fireEvent.click(within(title.closest("li")!).getByRole("button", { name: "Add to listed" }));
    await screen.findByText("Found Album is on 1985 (listed). Move it to 1987?");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByText(/Move it to 1987/)).toBeNull();
    expect(addCatalogAction).toHaveBeenCalledTimes(1);
    expect(screen.getByText("No albums for 1987 yet. Search below to add one.")).toBeDefined();
  });

  it("shows the server's message when the album is already on this page", async () => {
    setup({ addCatalog: async () => ({ error: "Found Album is already on this page." }) });
    const title = await search();

    fireEvent.click(within(title.closest("li")!).getByRole("button", { name: "Add to listed" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Found Album is already on this page.");
  });

  it("adds an album by hand into the chosen area", async () => {
    const { addManualAction } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Can't find it? Add it by hand" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Home Tape" } });
    fireEvent.change(screen.getByLabelText("Artist"), { target: { value: "Me" } });
    fireEvent.change(screen.getByLabelText("Release year (optional)"), { target: { value: "1987" } });
    fireEvent.change(screen.getByLabelText("Add to"), { target: { value: "listed" } });

    fireEvent.click(screen.getByRole("button", { name: "Add album" }));

    await waitFor(() => expect(addManualAction).toHaveBeenCalledWith(1987, { title: "Home Tape", artist: "Me", releaseYear: 1987, area: "listed" }));
    await screen.findByRole("group", { name: "Album 9" });
  });

  it("goes back to the last saved state and shows the error when a save fails", async () => {
    setup({
      placements: { ...empty, ranked: [1, 2, 3] },
      save: async () => ({ error: "Rank 2 in 1987 is already taken." }),
    });

    fireEvent.click(within(card("Album 3")).getByRole("button", { name: "Move up" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Rank 2 in 1987 is already taken.");
    expect(slotTitles().slice(0, 3)).toEqual(["Album 1", "Album 2", "Album 3"]);
  });

  it("sends changes one at a time: a change made while a save is in flight waits for it", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let calls = 0;
    const { saveAction } = setup({
      placements: { ...empty, ranked: [1, 2, 3] },
      save: async (_year, next) => {
        calls += 1;
        if (calls === 1) await gate;
        return { view: viewOf(next), removedDecadeEntries: [] };
      },
    });

    fireEvent.click(within(card("Album 3")).getByRole("button", { name: "Move up" }));
    await waitFor(() => expect(saveAction).toHaveBeenCalledTimes(1));
    fireEvent.click(within(card("Album 1")).getByRole("button", { name: "Move down" }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(saveAction).toHaveBeenCalledTimes(1);

    release();

    await waitFor(() => expect(saveAction).toHaveBeenCalledTimes(2));
    expect(saveAction).toHaveBeenLastCalledWith(1987, { ...empty, ranked: [3, 1, 2] });
    expect(slotTitles().slice(0, 3)).toEqual(["Album 3", "Album 1", "Album 2"]);
  });

  it("names the decade list entries a save removed", async () => {
    setup({
      placements: { ...empty, ranked: [1] },
      save: async (_year, next) => ({ view: viewOf(next), removedDecadeEntries: [{ decade: 1980, title: "Album 1" }] }),
    });

    fireEvent.click(within(card("Album 1")).getByRole("button", { name: "Remove" }));

    expect(await screen.findByText("Removed from the 1980s list: Album 1")).toBeDefined();
  });
});
