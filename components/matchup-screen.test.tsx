import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pairKey } from "@/lib/elo/pick";
import type { MatchupActionResult, MatchupView } from "@/lib/matchups-service";
import type { AlbumCard } from "@/lib/ratings";
import { MatchupScreen } from "./matchup-screen";

const card = (id: number, title: string, year: number): AlbumCard => ({
  id,
  title,
  artist: `Artist ${id}`,
  year,
  coverUrl: null,
});
const pairOf = (a: AlbumCard, b: AlbumCard) => ({ a, b });

const one = card(1, "Album One", 1964);
const two = card(2, "Album Two", 1959);
const three = card(3, "Album Three", 1971);
const four = card(4, "Album Four", 1985);

const initial: MatchupView = { pair: pairOf(one, two), count: 0, lastAnswer: null, canUndo: false };

function setup(actions: {
  answer?: MatchupActionResult;
  skip?: MatchupActionResult;
  undo?: MatchupActionResult;
  start?: MatchupView;
}) {
  const answerAction = vi.fn(async () => actions.answer!);
  const skipAction = vi.fn(async () => actions.skip!);
  const undoAction = vi.fn(async () => actions.undo!);
  render(
    <MatchupScreen
      initial={actions.start ?? initial}
      answerAction={answerAction}
      skipAction={skipAction}
      undoAction={undoAction}
    />,
  );
  return { answerAction, skipAction, undoAction };
}

describe("matchup screen", () => {
  afterEach(cleanup);

  it("shows the pair, the counter and a disabled Undo at zero", () => {
    setup({});
    expect(screen.getByText("Album One")).toBeDefined();
    expect(screen.getByText("Album Two")).toBeDefined();
    expect(screen.getByText("0 matchups played")).toBeDefined();
    expect((screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it.each([
    { name: "picking the left album", button: () => screen.getAllByRole("button", { name: "I like this more" })[0], result: "a" },
    { name: "picking the right album", button: () => screen.getAllByRole("button", { name: "I like this more" })[1], result: "b" },
    { name: "a tie", button: () => screen.getByRole("button", { name: "Tie" }), result: "tie" },
  ])("$name sends the answer and shows the next pair, the counter and the line", async ({ button, result }) => {
    const { answerAction } = setup({
      answer: { pair: pairOf(three, four), count: 1, lastAnswer: { text: "Album One 1500 → 1516" }, canUndo: true },
    });
    fireEvent.click(button());

    expect(await screen.findByText("Album Three")).toBeDefined();
    expect(answerAction).toHaveBeenCalledWith(1, 2, result, []);
    expect(screen.getByText("Album One 1500 → 1516")).toBeDefined();
    expect(screen.getByText("1 matchups played")).toBeDefined();
    expect((screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("skip shows the next pair, and sends the skipped pair as avoided on the next call", async () => {
    const { skipAction, answerAction } = setup({
      skip: { pair: pairOf(three, four), count: 0, lastAnswer: null, canUndo: false },
      answer: { pair: pairOf(one, two), count: 1, lastAnswer: { text: "line" }, canUndo: true },
    });
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));

    expect(await screen.findByText("Album Three")).toBeDefined();
    expect(skipAction).toHaveBeenCalledWith(1, 2, []);

    fireEvent.click(screen.getByRole("button", { name: "Tie" }));
    await screen.findByText("Album One");
    expect(answerAction).toHaveBeenCalledWith(3, 4, "tie", [pairKey(1, 2)]);
  });

  it("undo serves the undone pair again and shows the line", async () => {
    const { undoAction } = setup({
      start: { pair: pairOf(three, four), count: 1, lastAnswer: null, canUndo: true },
      undo: { pair: pairOf(one, two), count: 0, lastAnswer: { text: "Undone: Album One 1516 → 1500" }, canUndo: false },
    });
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    expect(await screen.findByText("Album One")).toBeDefined();
    expect(undoAction).toHaveBeenCalledWith([]);
    expect(screen.getByText("Undone: Album One 1516 → 1500")).toBeDefined();
    expect(screen.getByText("0 matchups played")).toBeDefined();
    await waitFor(() => expect((screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement).disabled).toBe(true));
  });

  it("shows an error and keeps the current pair when an action fails", async () => {
    setup({ answer: { error: "Those two albums can't be compared." } });
    fireEvent.click(screen.getByRole("button", { name: "Tie" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Those two albums can't be compared.");
    expect(screen.getByText("Album One")).toBeDefined();
  });

  it("asks for two library albums, with a link to search, when no pair is possible", () => {
    setup({ start: { pair: null, count: 0, lastAnswer: null, canUndo: false } });
    expect(screen.getByText("Add at least two albums to your library to start matchups.")).toBeDefined();
    expect(screen.getByRole("link", { name: "Search albums" }).getAttribute("href")).toBe("/search");
  });
});
