import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ replace: vi.fn<(url: string, options: { scroll: boolean }) => void>() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

// The real `isPending` stays true until the server has rendered the new URL. Here the test decides when that is:
// `startTransition` marks the box pending, and `finish` ends the oldest pending search.
const searches = vi.hoisted(() => ({ ends: [] as (() => void)[] }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useTransition: () => {
      const [isPending, setPending] = actual.useState(false);
      const startTransition = (callback: () => void) => {
        setPending(true);
        callback();
        searches.ends.push(() => setPending(false));
      };
      return [isPending, startTransition] as const;
    },
  };
});

import { SearchBox } from "./search-box";

function show(query = "") {
  render(<SearchBox query={query} />);
}

const box = () => screen.getByRole("searchbox");
const type = (text: string) => fireEvent.change(box(), { target: { value: text } });
const wait = (ms: number) => act(async () => void vi.advanceTimersByTime(ms));
const finish = () =>
  act(async () => {
    searches.ends.shift()?.();
  });

beforeEach(() => {
  vi.useFakeTimers();
  router.replace.mockReset();
  searches.ends.length = 0;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("search box", () => {
  it("replaces the URL once after a 500 ms pause, and typing again restarts the wait", async () => {
    show();
    type("getz");
    await wait(499);
    type("getz gilberto");
    await wait(499);
    expect(router.replace).not.toHaveBeenCalled();

    await wait(1);
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith("/search?q=getz+gilberto", { scroll: false });
  });

  it("starts no second search while one is pending, then sends only the latest text", async () => {
    show();
    type("getz");
    await wait(500);
    expect(screen.getByRole("status").textContent).toBe("Searching…");

    type("getz gil");
    await wait(500);
    type("getz gilberto");
    await wait(500);
    expect(router.replace).toHaveBeenCalledTimes(1);

    await finish();
    expect(router.replace.mock.calls.map(([url]) => url)).toEqual(["/search?q=getz", "/search?q=getz+gilberto"]);
    expect(box()).toHaveProperty("value", "getz gilberto");
  });

  it("sends nothing when the pending search finishes and the text has not changed", async () => {
    show();
    type("getz");
    await wait(500);
    await finish();

    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toBe("");
  });

  const skipped: { name: string; initial: string; typed: string; sent: string | null }[] = [
    { name: "text of 1 character is not sent", initial: "", typed: "a", sent: null },
    { name: "text of 1 character after trimming is not sent", initial: "", typed: "  a  ", sent: null },
    { name: "text equal to the current q after trimming is not sent", initial: "getz", typed: "  getz ", sent: null },
    { name: "clearing the box sends /search", initial: "getz", typed: "", sent: "/search" },
    { name: "text of 2 characters is sent", initial: "", typed: "ab", sent: "/search?q=ab" },
  ];
  it.each(skipped)("$name", async ({ initial, typed, sent }) => {
    show(initial);
    type(typed);
    await wait(500);

    expect(router.replace.mock.calls.map(([url]) => url)).toEqual(sent === null ? [] : [sent]);
  });

  it("cancels a waiting pause when the form is submitted", async () => {
    show();
    type("getz");
    fireEvent.submit(box().closest("form")!);
    await wait(500);

    expect(router.replace).not.toHaveBeenCalled();
  });

  it("shows a new ?q= from another navigation, and then searches the same text again", async () => {
    const { rerender } = render(<SearchBox query="getz" />);
    rerender(<SearchBox query="" />);
    expect((box() as HTMLInputElement).value).toBe("");

    type("getz");
    await wait(500);
    expect(router.replace).toHaveBeenCalledWith("/search?q=getz", { scroll: false });
  });
});
