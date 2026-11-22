import { describe, expect, it } from "vitest";
import { buildLog, toEvents } from "./log.ts";
import type { LogSource, Resize, SentEvent } from "./recorder.ts";

const START = 1_700_000_000_000;
const SENT: SentEvent[] = [
  { type: "navigation", kind: "load", url: "/", ts: START },
  { type: "navigation", kind: "push", url: "/search", ts: START + 250 },
];
const VIEWPORT = { width: 1280, height: 720 };

type Case = {
  name: string;
  source: LogSource;
  test?: string;
  viewport: { width: number; height: number } | null;
  resizes?: Resize[];
  expected: Record<string, unknown>;
};

const cases: Case[] = [
  {
    name: "a Playwright run has source and test",
    source: { kind: "playwright", host: "127.0.0.1:3100", branch: "feat/x", commit: "abc" },
    test: "search page: search for an album",
    viewport: VIEWPORT,
    expected: {
      source: { kind: "playwright", host: "127.0.0.1:3100", branch: "feat/x", commit: "abc" },
      test: "search page: search for an album",
      viewport: VIEWPORT,
      resizes: [],
    },
  },
  {
    name: "a clicked-through session has no test key",
    source: { kind: "preview", host: "localhost:4030", preview: "30" },
    viewport: VIEWPORT,
    expected: { source: { kind: "preview", host: "localhost:4030", preview: "30" }, viewport: VIEWPORT, resizes: [] },
  },
  {
    name: "resizes are written through, including one at t 0",
    source: { host: "localhost:3000" },
    viewport: VIEWPORT,
    resizes: [
      { t: 0, width: 900, height: 700 },
      { t: 5120, width: 600, height: 812 },
    ],
    expected: {
      source: { host: "localhost:3000" },
      viewport: VIEWPORT,
      resizes: [
        { t: 0, width: 900, height: 700 },
        { t: 5120, width: 600, height: 812 },
      ],
    },
  },
  {
    name: "undefined source fields are left out, not written as null",
    source: { host: "localhost:3000", kind: undefined, branch: undefined, commit: undefined },
    viewport: null,
    expected: { source: { host: "localhost:3000" }, viewport: null, resizes: [] },
  },
];

describe("buildLog", () => {
  it.each(cases)("$name", ({ source, test, viewport, resizes, expected }) => {
    const log = buildLog({ sent: SENT, startedAtMs: START, source, viewport, resizes, test });

    expect(log).toEqual({
      format: "album-ranker-events",
      version: 2,
      startedAt: "2023-11-14T22:13:20.000Z",
      events: toEvents(SENT, START),
      ...expected,
    });
    expect("test" in log).toBe(test !== undefined);
    expect(JSON.stringify(log)).not.toContain("undefined");
    expect(JSON.stringify(log.source)).not.toContain("null");
  });

  it("numbers events from 0 with t counted from startedAt", () => {
    expect(toEvents(SENT, START).map(({ seq, t }) => [seq, t])).toEqual([
      [0, 0],
      [1, 250],
    ]);
  });
});
