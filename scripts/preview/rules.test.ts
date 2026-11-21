import { describe, expect, it } from "vitest";
import {
  MAIN_PORT,
  checkRootOnMain,
  findWorktree,
  parseArgs,
  parseWorktrees,
  ticketNumberOf,
  ticketPort,
  type Worktree,
} from "./rules.ts";

const ROOT: Worktree = { path: "/repo", branch: "main", head: "aaa111" };
const T20: Worktree = {
  path: "/wt/a",
  branch: "feat/album-20-local-previews",
  head: "bbb222",
};
const T2: Worktree = { path: "/wt/b", branch: "feat/album-2-spec", head: "ccc333" };
const DETACHED: Worktree = { path: "/wt/c", branch: null, head: "ddd444" };
const UPPER: Worktree = { path: "/wt/d", branch: "feat/ALBUM-7-elo", head: "eee555" };
const DUP: Worktree = { path: "/wt/e", branch: "infra/album-20-other", head: "fff666" };

describe("parseArgs", () => {
  const ok = (command: unknown) => ({ ok: true, value: command });
  const start = (
    target: unknown,
    extra: { port?: number; empty?: boolean; copyMainData?: boolean } = {},
  ) =>
    ok({
      kind: "start",
      target,
      port: extra.port,
      empty: extra.empty ?? false,
      copyMainData: extra.copyMainData ?? false,
    });

  const cases: [string, string[], unknown][] = [
    ["main", ["main"], start({ kind: "main" })],
    ["ticket number", ["20"], start({ kind: "ticket", ticket: 20 })],
    [
      "branch name",
      ["feat/album-20-local-previews"],
      start({ kind: "branch", branch: "feat/album-20-local-previews" }),
    ],
    ["list", ["list"], ok({ kind: "list" })],
    ["stop ticket", ["stop", "20"], ok({ kind: "stop", target: { kind: "ticket", ticket: 20 } })],
    ["stop main", ["stop", "main"], ok({ kind: "stop", target: { kind: "main" } })],
    ["stop all", ["stop", "all"], ok({ kind: "stop", target: { kind: "all" } })],
    [
      "stop branch",
      ["stop", "feat/x"],
      ok({ kind: "stop", target: { kind: "branch", branch: "feat/x" } }),
    ],
    [
      "port flag",
      ["20", "--port", "4500"],
      start({ kind: "ticket", ticket: 20 }, { port: 4500 }),
    ],
    [
      "port flag before target",
      ["--port", "4500", "feat/x"],
      start({ kind: "branch", branch: "feat/x" }, { port: 4500 }),
    ],
    ["port flag with equals", ["20", "--port=4500"], start({ kind: "ticket", ticket: 20 }, { port: 4500 })],
    ["empty flag", ["20", "--empty"], start({ kind: "ticket", ticket: 20 }, { empty: true })],
    [
      "copy flag",
      ["20", "--copy-main-data"],
      start({ kind: "ticket", ticket: 20 }, { copyMainData: true }),
    ],
    ["no args", [], { ok: false, error: /target|usage/i }],
    ["port without value", ["20", "--port"], { ok: false, error: /--port needs/ }],
    ["port not a number", ["20", "--port", "abc"], { ok: false, error: /--port.*number/ }],
    ["port not an integer", ["20", "--port", "40.5"], { ok: false, error: /--port.*number/ }],
    ["empty with copy", ["20", "--empty", "--copy-main-data"], { ok: false, error: /cannot be used together/ }],
    ["flags on main", ["main", "--empty"], { ok: false, error: /main/ }],
    ["port on main", ["main", "--port", "4100"], { ok: false, error: /main/ }],
    ["unknown flag", ["20", "--nope"], { ok: false, error: /--nope/ }],
    ["two targets", ["20", "21"], { ok: false, error: /one target/ }],
    ["stop without target", ["stop"], { ok: false, error: /stop needs/ }],
    ["stop with flag", ["stop", "20", "--empty"], { ok: false, error: /stop/ }],
    ["list with extra", ["list", "20"], { ok: false, error: /list/ }],
  ];

  it.each(cases)("%s", (_name, argv, expected) => {
    const result = parseArgs(argv);
    const want = expected as { ok: boolean; error?: RegExp; value?: unknown };
    if (want.ok) {
      expect(result).toEqual(want);
    } else {
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(want.error as RegExp);
      }
    }
  });
});

describe("ticketPort", () => {
  it("main port is 4000", () => {
    expect(MAIN_PORT).toBe(4000);
  });

  const cases: [string, number | null, number | undefined, unknown][] = [
    ["ticket 20", 20, undefined, { ok: true, value: 4020 }],
    ["ticket 1", 1, undefined, { ok: true, value: 4001 }],
    ["ticket 999", 999, undefined, { ok: true, value: 4999 }],
    ["ticket 0", 0, undefined, { ok: false, error: /--port/ }],
    ["ticket 1000", 1000, undefined, { ok: false, error: /--port/ }],
    ["no ticket number", null, undefined, { ok: false, error: /--port/ }],
    ["override wins", 20, 5000, { ok: true, value: 5000 }],
    ["override without ticket", null, 5000, { ok: true, value: 5000 }],
    ["override lower bound", 20, 1024, { ok: true, value: 1024 }],
    ["override upper bound", 20, 65535, { ok: true, value: 65535 }],
    ["override too low", 20, 1023, { ok: false, error: /1024/ }],
    ["override too high", 20, 65536, { ok: false, error: /65535/ }],
  ];

  it.each(cases)("%s", (_name, n, override, expected) => {
    const result = ticketPort(n, override);
    const want = expected as { ok: boolean; value?: number; error?: RegExp };
    if (want.ok) {
      expect(result).toEqual(want);
    } else {
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(want.error as RegExp);
      }
    }
  });
});

describe("ticketNumberOf", () => {
  const cases: [string, string, number | null][] = [
    ["feature branch", "feat/album-20-local-previews", 20],
    ["infra branch", "infra/album-3-x", 3],
    ["upper case", "feat/ALBUM-7-elo", 7],
    ["no number", "feat/something", null],
    ["no trailing title", "feat/album-9", null],
    ["main", "main", null],
  ];

  it.each(cases)("%s", (_name, branch, expected) => {
    expect(ticketNumberOf(branch)).toBe(expected);
  });
});

describe("parseWorktrees", () => {
  const cases: [string, string, Worktree[]][] = [
    [
      "branch and detached entries",
      [
        "worktree /repo",
        "HEAD aaa111",
        "branch refs/heads/main",
        "",
        "worktree /wt/a",
        "HEAD bbb222",
        "branch refs/heads/feat/album-20-local-previews",
        "",
        "worktree /wt/c",
        "HEAD ddd444",
        "detached",
        "",
      ].join("\n"),
      [ROOT, T20, DETACHED],
    ],
    [
      "path with spaces and extra markers",
      [
        "worktree /my repo/wt",
        "HEAD abc",
        "branch refs/heads/feat/x",
        "locked",
        "prunable gitdir file points to non-existent location",
      ].join("\n"),
      [{ path: "/my repo/wt", branch: "feat/x", head: "abc" }],
    ],
    ["empty output", "", []],
  ];

  it.each(cases)("%s", (_name, text, expected) => {
    expect(parseWorktrees(text)).toEqual(expected);
  });
});

describe("findWorktree", () => {
  const all = [ROOT, T20, T2, DETACHED, UPPER];

  const cases: [string, Worktree[], Parameters<typeof findWorktree>[1], unknown][] = [
    ["ticket number", all, { kind: "ticket", ticket: 20 }, { ok: true, value: T20 }],
    ["ticket 2 does not match 20", all, { kind: "ticket", ticket: 2 }, { ok: true, value: T2 }],
    ["ticket case-insensitive", all, { kind: "ticket", ticket: 7 }, { ok: true, value: UPPER }],
    [
      "exact branch",
      all,
      { kind: "branch", branch: "feat/album-20-local-previews" },
      { ok: true, value: T20 },
    ],
    ["ticket with no match", all, { kind: "ticket", ticket: 99 }, { ok: false, error: /No worktree.*album-99-/ }],
    ["branch with no match", all, { kind: "branch", branch: "feat/nope" }, { ok: false, error: /No worktree.*feat\/nope/ }],
    ["branch partial is not a match", all, { kind: "branch", branch: "album-20" }, { ok: false, error: /No worktree/ }],
    [
      "two matches",
      [...all, DUP],
      { kind: "ticket", ticket: 20 },
      { ok: false, error: /More than one.*feat\/album-20-local-previews.*infra\/album-20-other/s },
    ],
  ];

  it.each(cases)("%s", (_name, worktrees, target, expected) => {
    const result = findWorktree(worktrees, target);
    const want = expected as { ok: boolean; error?: RegExp };
    if (want.ok) {
      expect(result).toEqual(expected);
    } else {
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(want.error as RegExp);
        expect(result.error).toContain("/wt/a");
      }
    }
  });
});

describe("checkRootOnMain", () => {
  const cases: [string, Worktree[], unknown][] = [
    ["root on main", [ROOT, T20], { ok: true, value: ROOT }],
    [
      "root on another branch",
      [{ ...ROOT, branch: "feat/x" }, T20],
      { ok: false, error: /feat\/x.*must stay on main/s },
    ],
    [
      "root detached",
      [{ ...ROOT, branch: null }, T20],
      { ok: false, error: /detached.*must stay on main/s },
    ],
    ["no worktrees", [], { ok: false, error: /root checkout/ }],
  ];

  it.each(cases)("%s", (_name, worktrees, expected) => {
    const result = checkRootOnMain(worktrees);
    const want = expected as { ok: boolean; error?: RegExp };
    if (want.ok) {
      expect(result).toEqual(expected);
    } else {
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(want.error as RegExp);
      }
    }
  });
});
