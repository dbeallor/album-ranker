import { describe, expect, it } from "vitest";
import type { PreviewRecord } from "../preview/index.ts";
import {
  DEFAULT_VIEWPORT,
  buildSource,
  matchPreviewByPort,
  matchPreviewByTarget,
  parseArgs,
  parseLsofCwd,
  parseLsofPids,
  portOf,
  previewCommandFor,
  recordingFolder,
  type PreviewCandidate,
  type SourceInput,
} from "./rules.ts";

describe("parseArgs", () => {
  const ok = (target: unknown, extra: { out?: string; viewport?: unknown } = {}) => ({
    ok: true,
    value: { target, out: extra.out, viewport: extra.viewport ?? DEFAULT_VIEWPORT },
  });
  const preview = (target: unknown) => ok({ kind: "preview", target });
  const url = (href: string, extra = {}) => ok({ kind: "url", url: href }, extra);

  const cases: [string, string[], unknown][] = [
    ["main", ["main"], preview({ kind: "main" })],
    ["ticket number", ["30"], preview({ kind: "ticket", ticket: 30 })],
    ["highest ticket", ["999"], preview({ kind: "ticket", ticket: 999 })],
    ["branch", ["feat/album-30-x"], preview({ kind: "branch", branch: "feat/album-30-x" })],
    ["port", ["3000"], url("http://localhost:3000")],
    ["lowest port", ["1024"], url("http://localhost:1024")],
    ["highest port", ["65535"], url("http://localhost:65535")],
    ["localhost URL with a path", ["http://localhost:3000/search"], url("http://localhost:3000/search")],
    ["127.0.0.1 URL", ["http://127.0.0.1:4030"], url("http://127.0.0.1:4030/")],
    ["[::1] URL", ["http://[::1]:3000"], url("http://[::1]:3000/")],
    ["--out and --viewport", ["main", "--out", "/tmp/r", "--viewport", "800x600"], ok({ kind: "preview", target: { kind: "main" } }, { out: "/tmp/r", viewport: { width: 800, height: 600 } })],
    ["= forms of the flags", ["3000", "--out=r", "--viewport=1024x768"], url("http://localhost:3000", { out: "r", viewport: { width: 1024, height: 768 } })],
    ["flags before the target", ["--viewport", "800x600", "main"], ok({ kind: "preview", target: { kind: "main" } }, { viewport: { width: 800, height: 600 } })],
    ["no target", [], { ok: false, error: expect.stringContaining("Missing target") }],
    ["two targets", ["main", "30"], { ok: false, error: expect.stringContaining("one target") }],
    ["non-loopback URL", ["https://example.com/"], { ok: false, error: expect.stringContaining("Refusing example.com") }],
    ["loopback lookalike", ["http://localhost.evil.com:3000"], { ok: false, error: expect.stringContaining("Refusing localhost.evil.com") }],
    ["credentials in front of another host", ["http://localhost@evil.com"], { ok: false, error: expect.stringContaining("Refusing evil.com") }],
    ["non-http URL", ["file:///etc/passwd"], { ok: false, error: expect.stringContaining("Only http") }],
    ["host without a scheme", ["localhost:3000"], { ok: false, error: expect.stringContaining("full URL") }],
    ["number that is no ticket or port", ["1000"], { ok: false, error: expect.stringContaining("neither") }],
    ["port too high", ["65536"], { ok: false, error: expect.stringContaining("neither") }],
    ["zero", ["0"], { ok: false, error: expect.stringContaining("neither") }],
    ["viewport not WxH", ["main", "--viewport", "wide"], { ok: false, error: expect.stringContaining("--viewport") }],
    ["viewport too small", ["main", "--viewport", "50x50"], { ok: false, error: expect.stringContaining("--viewport") }],
    ["viewport too large", ["main", "--viewport", "99999x720"], { ok: false, error: expect.stringContaining("--viewport") }],
    ["flag without a value", ["main", "--out"], { ok: false, error: expect.stringContaining("--out needs a value") }],
    ["unknown flag", ["main", "--headless"], { ok: false, error: expect.stringContaining("Unknown flag --headless") }],
  ];

  it.each(cases)("%s", (_name, argv, expected) => {
    expect(parseArgs(argv)).toEqual(expected);
  });
});

const record = (over: Partial<PreviewRecord>): PreviewRecord => ({
  pid: 100,
  port: 4000,
  target: "main",
  branch: "main",
  startedAt: "2026-11-21T10:00:00.000Z",
  commit: "a".repeat(40),
  ...over,
});
const MAIN: PreviewCandidate = { record: record({}), checkout: "/repo", alive: true };
const T30: PreviewCandidate = {
  record: record({ pid: 300, port: 4030, target: "30", branch: "feat/album-30-record", commit: "b".repeat(40) }),
  checkout: "/wt/30",
  alive: true,
};
const T30_STALE: PreviewCandidate = { ...T30, alive: false };
const BRANCHY: PreviewCandidate = {
  record: record({ pid: 500, port: 4500, target: "feat/spike", branch: "feat/spike" }),
  checkout: "/wt/spike",
  alive: true,
};

describe("matchPreviewByPort", () => {
  const cases: [string, PreviewCandidate[], number, unknown][] = [
    ["live preview on the port", [MAIN, T30], 4030, { state: "live", record: T30.record, checkout: "/wt/30" }],
    ["stale record (process gone)", [MAIN, T30_STALE], 4030, { state: "stale", record: T30.record, checkout: "/wt/30" }],
    ["live wins over a stale record on the same port", [T30_STALE, { ...MAIN, record: record({ port: 4030, target: "x" }) }], 4030, { state: "live", record: record({ port: 4030, target: "x" }), checkout: "/repo" }],
    ["no record on the port", [MAIN, T30], 3000, { state: "none" }],
    ["no records at all", [], 4000, { state: "none" }],
  ];

  it.each(cases)("%s", (_name, candidates, port, expected) => {
    expect(matchPreviewByPort(candidates, port)).toEqual(expected);
  });
});

describe("matchPreviewByTarget", () => {
  const cases: [string, PreviewCandidate[], Parameters<typeof matchPreviewByTarget>[1], unknown][] = [
    ["main", [T30, MAIN], { kind: "main" }, { state: "live", record: MAIN.record, checkout: "/repo" }],
    ["ticket by label", [MAIN, T30], { kind: "ticket", ticket: 30 }, { state: "live", record: T30.record, checkout: "/wt/30" }],
    ["ticket by branch when the label is the branch", [BRANCHY, { ...T30, record: record({ target: "feat/album-30-record", branch: "feat/album-30-record", port: 4030 }) }], { kind: "ticket", ticket: 30 }, { state: "live", record: record({ target: "feat/album-30-record", branch: "feat/album-30-record", port: 4030 }), checkout: "/wt/30" }],
    ["branch", [MAIN, BRANCHY], { kind: "branch", branch: "feat/spike" }, { state: "live", record: BRANCHY.record, checkout: "/wt/spike" }],
    ["stale record for the target", [T30_STALE], { kind: "ticket", ticket: 30 }, { state: "stale", record: T30.record, checkout: "/wt/30" }],
    ["target not running", [MAIN], { kind: "ticket", ticket: 30 }, { state: "none" }],
    ["ticket 3 is not ticket 30", [T30], { kind: "ticket", ticket: 3 }, { state: "none" }],
  ];

  it.each(cases)("%s", (_name, candidates, target, expected) => {
    expect(matchPreviewByTarget(candidates, target)).toEqual(expected);
  });
});

describe("previewCommandFor", () => {
  const cases: [Parameters<typeof previewCommandFor>[0], string][] = [
    [{ kind: "main" }, "npm run preview -- main"],
    [{ kind: "ticket", ticket: 30 }, "npm run preview -- 30"],
    [{ kind: "branch", branch: "feat/spike" }, "npm run preview -- feat/spike"],
  ];

  it.each(cases)("%j", (target, expected) => {
    expect(previewCommandFor(target)).toBe(expected);
  });
});

describe("buildSource", () => {
  const SHA_A = "a".repeat(40);
  const SHA_B = "b".repeat(40);
  const SHA_HEAD = "c".repeat(40);
  const git = { branch: "feat/album-30-record", worktree: "/wt/30", commit: SHA_HEAD };

  const cases: [string, SourceInput, unknown][] = [
    [
      "main preview: commit built at start, not HEAD now",
      { url: "http://localhost:4000/", preview: MAIN, git: { branch: "main", worktree: "/repo", commit: SHA_HEAD } },
      { host: "localhost:4000", kind: "preview", preview: "main", branch: "main", worktree: "/repo", commit: SHA_A },
    ],
    [
      "ticket preview: HEAD when recording starts",
      { url: "http://localhost:4030/", preview: T30, git },
      { host: "localhost:4030", kind: "preview", preview: "30", branch: "feat/album-30-record", worktree: "/wt/30", commit: SHA_HEAD },
    ],
    [
      "ticket preview, git failed: commit from the record",
      { url: "http://localhost:4030/", preview: T30, git: {} },
      { host: "localhost:4030", kind: "preview", preview: "30", branch: "feat/album-30-record", worktree: "/wt/30", commit: SHA_B },
    ],
    [
      "main preview from before ALBUM-30 has no commit, so none is guessed",
      { url: "http://localhost:4000/", preview: { ...MAIN, record: record({ commit: undefined }) }, git: { commit: SHA_HEAD } },
      { host: "localhost:4000", kind: "preview", preview: "main", branch: "main", worktree: "/repo" },
    ],
    [
      "dev server: next dev listener",
      { url: "http://localhost:3000/", listener: { cwd: "/wt/30", command: "node /wt/30/node_modules/.bin/next dev" }, git },
      { host: "localhost:3000", kind: "dev", branch: "feat/album-30-record", worktree: "/wt/30", commit: SHA_HEAD },
    ],
    [
      "dev server: next-server child of next dev",
      { url: "http://localhost:3000/", listener: { cwd: "/wt/30", command: "next-server (v16.4.6)", parentCommand: "node next dev" }, git },
      { host: "localhost:3000", kind: "dev", branch: "feat/album-30-record", worktree: "/wt/30", commit: SHA_HEAD },
    ],
    [
      "other server: no kind",
      { url: "http://localhost:3000/", listener: { cwd: "/wt/30", command: "node next start" }, git },
      { host: "localhost:3000", branch: "feat/album-30-record", worktree: "/wt/30", commit: SHA_HEAD },
    ],
    [
      "detached HEAD: no branch",
      { url: "http://localhost:3000/", listener: { command: "next dev" }, git: { worktree: "/wt/30", commit: SHA_HEAD } },
      { host: "localhost:3000", kind: "dev", worktree: "/wt/30", commit: SHA_HEAD },
    ],
    [
      "every lookup failed: host only",
      { url: "http://localhost:3000/", git: {} },
      { host: "localhost:3000" },
    ],
    [
      "a preview match wins over a next dev listener",
      { url: "http://localhost:4030/", preview: T30, listener: { command: "next dev" }, git },
      { host: "localhost:4030", kind: "preview", preview: "30", branch: "feat/album-30-record", worktree: "/wt/30", commit: SHA_HEAD },
    ],
    [
      "127.0.0.1 host keeps its form",
      { url: "http://127.0.0.1:3000/search", git: {} },
      { host: "127.0.0.1:3000" },
    ],
  ];

  it.each(cases)("%s", (_name, input, expected) => {
    expect(buildSource(input)).toEqual(expected);
  });
});

describe("recordingFolder", () => {
  const cases: [Date, number, string][] = [
    [new Date(2026, 10, 21, 15, 4, 5), 3000, "20261121-150405-3000"],
    [new Date(2026, 0, 2, 3, 4, 5), 4030, "20260102-030405-4030"],
  ];

  it.each(cases)("%s", (now, port, expected) => {
    expect(recordingFolder(now, port)).toBe(expected);
  });
});

describe("portOf", () => {
  const cases: [string, number][] = [
    ["http://localhost:3000/", 3000],
    ["http://localhost/", 80],
    ["https://localhost/", 443],
  ];

  it.each(cases)("%s", (url, expected) => {
    expect(portOf(url)).toBe(expected);
  });
});

describe("lsof output", () => {
  it.each([
    ["one listener", "p1234\n", [1234]],
    ["IPv4 and IPv6 rows", "p1234\nf12\np1234\nf13\n", [1234, 1234]],
    ["nothing", "", []],
  ])("pids: %s", (_name, output, expected) => {
    expect(parseLsofPids(output)).toEqual(expected);
  });

  it.each([
    ["cwd row", "p1234\nfcwd\nn/Users/me/album ranker\n", "/Users/me/album ranker"],
    ["no cwd row", "p1234\n", undefined],
  ])("cwd: %s", (_name, output, expected) => {
    expect(parseLsofCwd(output)).toBe(expected);
  });
});
