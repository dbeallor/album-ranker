import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DecadeActionResult, DecadeRow, DecadeView } from "@/lib/decade-service";
import { DecadeList } from "./decade-list";

const row = (albumId: number, rating = 1500 - albumId): DecadeRow => ({
  albumId,
  title: `Album ${albumId}`,
  artist: `Artist ${albumId}`,
  year: 1990,
  coverUrl: null,
  rating,
});

/** A view with these albums on the list, in order, and these others in the panel. */
function view(listIds: number[], panelIds: number[] = []): DecadeView {
  const list = listIds.map((id) => row(id));
  const panel = panelIds.map((id) => row(id));
  return {
    decade: 1990,
    list,
    suggestion: listIds.length === 0 ? panel : null,
    panel,
    eligibleCount: list.length + panel.length,
  };
}

/** Saves succeed and return the view for the saved order; the panel is every other known album. */
function savingActions(all: number[]) {
  const saveAction = vi.fn(async (_decade: number, ids: number[]): Promise<DecadeActionResult> => view(ids, all.filter((id) => !ids.includes(id))));
  const acceptAction = vi.fn(async (_decade: number, ids: number[]): Promise<DecadeActionResult> => view(ids, all.filter((id) => !ids.includes(id))));
  return { saveAction, acceptAction };
}

function titlesOnList(): string[] {
  const list = screen.getByRole("list", { name: "Top 25 of the 1990s" });
  return within(list)
    .getAllByRole("listitem")
    .map((item) => within(item).getByRole("strong", { hidden: true }).textContent!);
}

describe("decade list", () => {
  afterEach(cleanup);

  it("shows the suggestion read only, then the editable list after Accept", async () => {
    const { saveAction, acceptAction } = savingActions([1, 2, 3]);
    render(<DecadeList initial={view([], [1, 2, 3])} saveAction={saveAction} acceptAction={acceptAction} />);

    expect(screen.getByText("No list for the 1990s yet. Here is a suggestion from your ratings.")).toBeDefined();
    expect(screen.queryByRole("button", { name: /Move up/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Accept suggestion" }));

    expect(await screen.findByText("3 of 25")).toBeDefined();
    expect(acceptAction).toHaveBeenCalledWith(1990, [1, 2, 3]);
    expect(screen.getAllByRole("button", { name: /Move up/ })).toHaveLength(3);
  });

  it("moves an album up and down, with the buttons disabled at the ends", async () => {
    const { saveAction, acceptAction } = savingActions([1, 2, 3]);
    render(<DecadeList initial={view([1, 2, 3])} saveAction={saveAction} acceptAction={acceptAction} />);

    expect((screen.getByRole("button", { name: "Move up Album 1" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Move down Album 3" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Move up Album 3" }));
    expect(titlesOnList()).toEqual(["Album 1", "Album 3", "Album 2"]);
    await waitFor(() => expect(saveAction).toHaveBeenLastCalledWith(1990, [1, 3, 2]));

    fireEvent.click(screen.getByRole("button", { name: "Move down Album 1" }));
    expect(titlesOnList()).toEqual(["Album 3", "Album 1", "Album 2"]);
    await waitFor(() => expect(saveAction).toHaveBeenLastCalledWith(1990, [3, 1, 2]));
  });

  it("removes an album and closes the positions up", async () => {
    const { saveAction, acceptAction } = savingActions([1, 2, 3]);
    render(<DecadeList initial={view([1, 2, 3])} saveAction={saveAction} acceptAction={acceptAction} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove Album 2" }));

    expect(titlesOnList()).toEqual(["Album 1", "Album 3"]);
    expect(await screen.findByText("2 of 25")).toBeDefined();
    expect(saveAction).toHaveBeenCalledWith(1990, [1, 3]);
    expect(screen.getByRole("button", { name: "Add Album 2" })).toBeDefined();
  });

  it("adds an album from the panel at the end of the list", async () => {
    const { saveAction, acceptAction } = savingActions([1, 2, 3]);
    render(<DecadeList initial={view([1, 2], [3])} saveAction={saveAction} acceptAction={acceptAction} />);

    fireEvent.click(screen.getByRole("button", { name: "Add Album 3" }));

    expect(titlesOnList()).toEqual(["Album 1", "Album 2", "Album 3"]);
    expect(await screen.findByText("Every eligible album is on the list.")).toBeDefined();
    expect(saveAction).toHaveBeenCalledWith(1990, [1, 2, 3]);
  });

  it("disables Add when 25 albums are on the list", () => {
    const ids = Array.from({ length: 25 }, (_, i) => i + 1);
    const { saveAction, acceptAction } = savingActions([...ids, 26]);
    render(<DecadeList initial={view(ids, [26])} saveAction={saveAction} acceptAction={acceptAction} />);

    expect(screen.getByText("The list is full. Remove one to add another.")).toBeDefined();
    const add = screen.getByRole("button", { name: "Add Album 26" }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    fireEvent.click(add);
    expect(saveAction).not.toHaveBeenCalled();
  });

  it("goes back to the saved list and shows the message when a save fails", async () => {
    const saveAction = vi.fn(async (): Promise<DecadeActionResult> => ({ error: "A decade list holds at most 25 albums." }));
    render(<DecadeList initial={view([1, 2, 3])} saveAction={saveAction} acceptAction={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Move up Album 3" }));
    expect(titlesOnList()).toEqual(["Album 1", "Album 3", "Album 2"]);

    expect((await screen.findByRole("alert")).textContent).toBe("A decade list holds at most 25 albums.");
    expect(titlesOnList()).toEqual(["Album 1", "Album 2", "Album 3"]);
  });
});
