import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installRecorder, type EventBody, type SentEvent } from "./recorder";

const NOW = 1_700_000_000_000;

function type(input: HTMLInputElement, value: string) {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

type Case = {
  name: string;
  html: string;
  act: () => void;
  /** Events after the initial `load` of "/". */
  expected: EventBody[];
};

const el = <T extends Element>(selector: string) => document.querySelector(selector) as T;

const cases: Case[] = [
  {
    name: "install alone sends a load for the current page",
    html: "",
    act: () => {},
    expected: [],
  },
  {
    name: "click on a link",
    html: `<main><p><a href="/search">Search albums</a></p></main>`,
    act: () => el("a").dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 64, clientY: 103 })),
    expected: [
      { type: "click", x: 64, y: 103, target: { tag: "a", selector: "main > p > a", text: "Search albums" } },
    ],
  },
  {
    name: "click on one of two same-tag siblings gets a unique selector",
    html: `<main><p><a href="/a">First</a></p><p><a href="/b">Second</a></p></main>`,
    act: () => el("p:nth-of-type(2) a").dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 5, clientY: 6 })),
    expected: [
      { type: "click", x: 5, y: 6, target: { tag: "a", selector: "main > p:nth-of-type(2) > a", text: "Second" } },
    ],
  },
  {
    name: "input in a named field",
    html: `<main><form><input name="q"></form></main>`,
    act: () => type(el("input"), "g"),
    expected: [
      { type: "input", value: "g", target: { tag: "input", selector: 'main > form > input[name="q"]', name: "q" } },
    ],
  },
  {
    name: "input in a field labelled by aria-label",
    html: `<main><form><input type="search" name="q" aria-label="Album or artist"></form></main>`,
    act: () => type(el("input"), "getz"),
    expected: [
      {
        type: "input",
        value: "getz",
        target: { tag: "input", selector: 'main > form > input[name="q"]', name: "q", label: "Album or artist" },
      },
    ],
  },
  {
    name: "input in a field labelled by a label element, found by id",
    html: `<main><form><label for="artist">Artist name</label><input id="artist"></form></main>`,
    act: () => type(el("input"), "stan"),
    expected: [
      { type: "input", value: "stan", target: { tag: "input", selector: "#artist", id: "artist", label: "Artist name" } },
    ],
  },
  {
    name: "password input value is masked",
    html: `<main><form><input type="password" name="pw"></form></main>`,
    act: () => type(el("input"), "hunter2"),
    expected: [
      { type: "input", value: "***", target: { tag: "input", selector: 'main > form > input[name="pw"]', name: "pw" } },
    ],
  },
  {
    name: "form submit",
    html: `<main><form><input name="q"><button type="submit">Search</button></form></main>`,
    act: () => el("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
    expected: [{ type: "submit", target: { tag: "form", selector: "main > form" } }],
  },
  {
    name: "pushState",
    html: "",
    act: () => history.pushState({}, "", "/search?q=a#top"),
    expected: [{ type: "navigation", kind: "push", url: "/search?q=a" }],
  },
  {
    name: "replaceState",
    html: "",
    act: () => history.replaceState({}, "", "/matchups"),
    expected: [{ type: "navigation", kind: "replace", url: "/matchups" }],
  },
  {
    name: "popstate",
    html: "",
    act: () => {
      history.replaceState({}, "", "/back");
      window.dispatchEvent(new PopStateEvent("popstate"));
    },
    expected: [
      { type: "navigation", kind: "replace", url: "/back" },
      { type: "navigation", kind: "pop", url: "/back" },
    ],
  },
];

describe("installRecorder", () => {
  let uninstall: (() => void) | undefined;

  beforeEach(() => {
    history.replaceState({}, "", "/");
    document.addEventListener("click", (event) => event.preventDefault());
  });

  afterEach(() => {
    uninstall?.();
    uninstall = undefined;
    document.body.innerHTML = "";
  });

  it.each(cases)("$name", ({ html, act, expected }) => {
    document.body.innerHTML = html;
    const sent: SentEvent[] = [];
    uninstall = installRecorder((event) => sent.push(event), () => NOW);

    act();

    const load: EventBody = { type: "navigation", kind: "load", url: "/" };
    const bodies = sent.map((event) => {
      const body: Partial<SentEvent> = { ...event };
      delete body.ts;
      return body;
    });
    expect(bodies).toEqual([load, ...expected]);
    expect(sent.every((event) => event.ts === NOW)).toBe(true);
  });

  it("stops recording and restores history after uninstall", () => {
    const sent: SentEvent[] = [];
    const originalPush = history.pushState;
    installRecorder((event) => sent.push(event))();
    history.pushState({}, "", "/after");

    expect(history.pushState).toBe(originalPush);
    expect(sent).toHaveLength(1);
  });
});
