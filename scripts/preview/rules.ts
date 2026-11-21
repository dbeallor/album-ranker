export const MAIN_PORT = 4000;

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export type Worktree = { path: string; branch: string | null; head: string };

export type Target =
  | { kind: "main" }
  | { kind: "ticket"; ticket: number }
  | { kind: "branch"; branch: string };

export type StopTarget = Target | { kind: "all" };

export type Command =
  | {
      kind: "start";
      target: Target;
      port: number | undefined;
      empty: boolean;
      copyMainData: boolean;
    }
  | { kind: "list" }
  | { kind: "stop"; target: StopTarget };

export const USAGE = [
  "Usage:",
  "  npm run preview -- main",
  "  npm run preview -- <ticket number | branch> [--port <p>] [--empty | --copy-main-data]",
  "  npm run preview -- list",
  "  npm run preview -- stop <main | ticket number | branch | all>",
].join("\n");

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

function toTarget(word: string): Target {
  if (word === "main") {
    return { kind: "main" };
  }
  if (/^\d+$/.test(word)) {
    return { kind: "ticket", ticket: Number(word) };
  }
  return { kind: "branch", branch: word };
}

export function parseArgs(argv: string[]): Result<Command> {
  const words: string[] = [];
  let port: number | undefined;
  let empty = false;
  let copyMainData = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--empty") {
      empty = true;
    } else if (arg === "--copy-main-data") {
      copyMainData = true;
    } else if (arg === "--port" || arg.startsWith("--port=")) {
      const raw = arg === "--port" ? argv[++i] : arg.slice("--port=".length);
      if (raw === undefined || raw.startsWith("--")) {
        return fail("--port needs a port number, for example --port 4100.");
      }
      if (!/^\d+$/.test(raw)) {
        return fail(`--port needs a whole number, got "${raw}".`);
      }
      port = Number(raw);
    } else if (arg.startsWith("--")) {
      return fail(`Unknown flag ${arg}.\n${USAGE}`);
    } else {
      words.push(arg);
    }
  }

  const hasFlags = port !== undefined || empty || copyMainData;

  if (empty && copyMainData) {
    return fail("--empty and --copy-main-data cannot be used together.");
  }
  if (words.length === 0) {
    return fail(`Missing target.\n${USAGE}`);
  }

  if (words[0] === "list") {
    if (words.length > 1 || hasFlags) {
      return fail("list takes no target and no flags.");
    }
    return { ok: true, value: { kind: "list" } };
  }

  if (words[0] === "stop") {
    if (words.length < 2) {
      return fail(`stop needs a target: main, a ticket number, a branch or all.\n${USAGE}`);
    }
    if (words.length > 2 || hasFlags) {
      return fail("stop takes one target and no flags.");
    }
    const target: StopTarget = words[1] === "all" ? { kind: "all" } : toTarget(words[1]);
    return { ok: true, value: { kind: "stop", target } };
  }

  if (words.length > 1) {
    return fail(`Give one target, got ${words.length}: ${words.join(" ")}.`);
  }

  const target = toTarget(words[0]);
  if (target.kind === "main" && hasFlags) {
    return fail("--port, --empty and --copy-main-data apply to ticket previews, not main.");
  }
  return { ok: true, value: { kind: "start", target, port, empty, copyMainData } };
}

export function ticketNumberOf(branch: string): number | null {
  const match = /album-(\d+)-/i.exec(branch);
  return match ? Number(match[1]) : null;
}

export function ticketPort(ticket: number | null, override?: number): Result<number> {
  if (override !== undefined) {
    if (!Number.isInteger(override) || override < 1024 || override > 65535) {
      return fail(`--port must be a whole number from 1024 to 65535, got ${override}.`);
    }
    return { ok: true, value: override };
  }
  if (ticket === null) {
    return fail("This branch has no ticket number, so pass a port with --port <p>.");
  }
  if (!Number.isInteger(ticket) || ticket < 1 || ticket > 999) {
    return fail(`Ticket ${ticket} is outside 1 to 999, so pass a port with --port <p>.`);
  }
  return { ok: true, value: MAIN_PORT + ticket };
}

export function parseWorktrees(porcelain: string): Worktree[] {
  const worktrees: Worktree[] = [];
  let current: Worktree | null = null;

  for (const line of porcelain.split("\n")) {
    if (line.startsWith("worktree ")) {
      current = { path: line.slice("worktree ".length), branch: null, head: "" };
      worktrees.push(current);
    } else if (current && line.startsWith("HEAD ")) {
      current.head = line.slice("HEAD ".length);
    } else if (current && line.startsWith("branch ")) {
      current.branch = line.slice("branch ".length).replace(/^refs\/heads\//, "");
    }
  }
  return worktrees;
}

function listWorktrees(worktrees: Worktree[]): string {
  return worktrees.map((w) => `  ${w.branch ?? "(detached)"}  ${w.path}`).join("\n");
}

export function findWorktree(
  worktrees: Worktree[],
  target: Exclude<Target, { kind: "main" }>,
): Result<Worktree> {
  const wanted = target.kind === "ticket" ? `album-${target.ticket}-` : target.branch;
  const matches = worktrees.filter((w) => {
    if (w.branch === null) {
      return false;
    }
    return target.kind === "ticket"
      ? w.branch.toLowerCase().includes(wanted)
      : w.branch === wanted;
  });

  if (matches.length === 1) {
    return { ok: true, value: matches[0] };
  }
  const what = target.kind === "ticket" ? `a branch containing ${wanted}` : `the branch ${wanted}`;
  const problem = matches.length === 0 ? `No worktree has ${what}.` : `More than one worktree has ${what}.`;
  return fail(`${problem} Worktrees:\n${listWorktrees(matches.length === 0 ? worktrees : matches)}`);
}

export function checkRootOnMain(worktrees: Worktree[]): Result<Worktree> {
  const root = worktrees[0];
  if (!root) {
    return fail("Could not find the root checkout in git worktree list.");
  }
  if (root.branch !== "main") {
    return fail(
      `The root checkout ${root.path} is on ${root.branch ?? "a detached head"}; it must stay on main.`,
    );
  }
  return { ok: true, value: root };
}
