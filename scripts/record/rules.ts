import type { GitInfo } from "../../e2e/recorder/source.ts";
import type { LogSource } from "../../e2e/recorder/recorder.ts";
import type { PreviewRecord } from "../preview/index.ts";
import { ticketNumberOf, type Result, type Target } from "../preview/rules.ts";

export type Viewport = { width: number; height: number };

export type RecordTarget =
  | { kind: "preview"; target: Target }
  | { kind: "url"; url: string };

export type RecordCommand = {
  target: RecordTarget;
  out: string | undefined;
  viewport: Viewport;
};

export const DEFAULT_VIEWPORT: Viewport = { width: 1280, height: 720 };

export const USAGE = [
  "Usage:",
  "  npm run record -- <target> [--out <dir>] [--viewport <W>x<H>]",
  "",
  "<target> is one of:",
  "  main | <ticket number> | <branch>   the running preview of that target",
  "  <port>                              http://localhost:<port> (1024 to 65535)",
  "  <url>                               a URL on localhost, 127.0.0.1 or [::1]",
].join("\n");

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const VIEWPORT_MIN = 100;
const VIEWPORT_MAX = 10_000;

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

function parseViewport(raw: string): Result<Viewport> {
  const match = /^(\d+)x(\d+)$/.exec(raw);
  const width = match ? Number(match[1]) : 0;
  const height = match ? Number(match[2]) : 0;
  const inRange = (n: number) => n >= VIEWPORT_MIN && n <= VIEWPORT_MAX;
  if (!match || !inRange(width) || !inRange(height)) {
    return fail(`--viewport needs <W>x<H> with each side from ${VIEWPORT_MIN} to ${VIEWPORT_MAX}, for example 1280x720. Got "${raw}".`);
  }
  return { ok: true, value: { width, height } };
}

function parseTarget(word: string): Result<RecordTarget> {
  if (word === "main") {
    return { ok: true, value: { kind: "preview", target: { kind: "main" } } };
  }
  if (/^\d+$/.test(word)) {
    const n = Number(word);
    if (n >= 1 && n <= 999) {
      return { ok: true, value: { kind: "preview", target: { kind: "ticket", ticket: n } } };
    }
    if (n >= 1024 && n <= 65535) {
      return { ok: true, value: { kind: "url", url: `http://localhost:${n}` } };
    }
    return fail(`"${word}" is neither a ticket number (1 to 999) nor a port (1024 to 65535).`);
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(word)) {
    let url: URL;
    try {
      url = new URL(word);
    } catch {
      return fail(`"${word}" is not a valid URL.`);
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return fail(`Only http and https URLs can be recorded, got ${url.protocol}`);
    }
    if (!LOOPBACK_HOSTS.has(url.hostname)) {
      return fail(`Refusing ${url.hostname}: only localhost, 127.0.0.1 and [::1] can be recorded.`);
    }
    return { ok: true, value: { kind: "url", url: url.href } };
  }
  if (word.includes(":")) {
    return fail(`"${word}" looks like a host. Give a full URL, for example http://${word}.`);
  }
  return { ok: true, value: { kind: "preview", target: { kind: "branch", branch: word } } };
}

export function parseArgs(argv: string[]): Result<RecordCommand> {
  const words: string[] = [];
  let out: string | undefined;
  let viewport = DEFAULT_VIEWPORT;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const flag = arg.startsWith("--") ? arg.split("=", 1)[0] : undefined;
    if (flag === "--out" || flag === "--viewport") {
      const raw = arg.includes("=") ? arg.slice(flag.length + 1) : argv[++i];
      if (raw === undefined || raw === "" || raw.startsWith("--")) {
        return fail(`${flag} needs a value.\n${USAGE}`);
      }
      if (flag === "--out") {
        out = raw;
      } else {
        const parsed = parseViewport(raw);
        if (!parsed.ok) {
          return parsed;
        }
        viewport = parsed.value;
      }
    } else if (flag) {
      return fail(`Unknown flag ${flag}.\n${USAGE}`);
    } else {
      words.push(arg);
    }
  }

  if (words.length === 0) {
    return fail(`Missing target.\n${USAGE}`);
  }
  if (words.length > 1) {
    return fail(`Give one target, got ${words.length}: ${words.join(" ")}.`);
  }
  const target = parseTarget(words[0]);
  if (!target.ok) {
    return target;
  }
  return { ok: true, value: { target: target.value, out, viewport } };
}

/** The line that starts the preview a `main`, ticket or branch target needs. */
export function previewCommandFor(target: Target): string {
  const word = target.kind === "main" ? "main" : target.kind === "ticket" ? String(target.ticket) : target.branch;
  return `npm run preview -- ${word}`;
}

/** A preview record found in a checkout's `.preview/` folder, and whether its process group is still running. */
export type PreviewCandidate = { record: PreviewRecord; checkout: string; alive: boolean };

export type PreviewMatch =
  | { state: "live"; record: PreviewRecord; checkout: string }
  | { state: "stale"; record: PreviewRecord; checkout: string }
  | { state: "none" };

function pick(candidates: PreviewCandidate[]): PreviewMatch {
  const live = candidates.find((candidate) => candidate.alive);
  if (live) {
    return { state: "live", record: live.record, checkout: live.checkout };
  }
  const stale = candidates[0];
  return stale ? { state: "stale", record: stale.record, checkout: stale.checkout } : { state: "none" };
}

/** The preview that serves a port. Previews bind to loopback only, so the port alone identifies it. */
export function matchPreviewByPort(candidates: PreviewCandidate[], port: number): PreviewMatch {
  return pick(candidates.filter((candidate) => candidate.record.port === port));
}

/** The preview of a `main`, ticket or branch target, the way `npm run preview -- list` names them. */
export function matchPreviewByTarget(candidates: PreviewCandidate[], target: Target): PreviewMatch {
  return pick(
    candidates.filter(({ record }) => {
      if (target.kind === "main") {
        return record.target === "main";
      }
      if (target.kind === "ticket") {
        return record.target === String(target.ticket) || (record.branch !== null && ticketNumberOf(record.branch) === target.ticket);
      }
      return record.target === target.branch || record.branch === target.branch;
    }),
  );
}

/** The port of a URL, with the scheme's default when the URL has none. */
export function portOf(url: string): number {
  const parsed = new URL(url);
  if (parsed.port) {
    return Number(parsed.port);
  }
  return parsed.protocol === "https:" ? 443 : 80;
}

/** What `lsof` and `ps` found about the process listening on the port. Each field is missing when its lookup failed. */
export type Listener = { cwd?: string; command?: string; parentCommand?: string };

export type SourceInput = {
  url: string;
  /** Set when the URL is served by a live preview. */
  preview?: { record: PreviewRecord; checkout: string };
  listener?: Listener;
  /** From `gitInfo` on the previewed checkout, or on the listener's working folder. */
  git: GitInfo;
};

const NEXT_DEV = "next dev";

/** The log's `source`: only what is known; never a guess. */
export function buildSource({ url, preview, listener, git }: SourceInput): LogSource {
  const source: LogSource = { host: new URL(url).host };
  const set = <K extends keyof LogSource>(key: K, value: LogSource[K] | null | undefined) => {
    if (value) {
      source[key] = value;
    }
  };

  if (preview) {
    const { record, checkout } = preview;
    set("kind", "preview");
    set("preview", record.target);
    set("branch", record.branch ?? git.branch);
    set("worktree", checkout);
    // Main is built once, when the preview starts. A ticket preview reloads code as it changes, so HEAD now is the code you see.
    set("commit", record.target === "main" ? record.commit : (git.commit ?? record.commit));
    return source;
  }

  const runsNextDev = [listener?.command, listener?.parentCommand].some((command) => command?.includes(NEXT_DEV));
  set("kind", runsNextDev ? "dev" : undefined);
  set("branch", git.branch);
  set("worktree", git.worktree);
  set("commit", git.commit);
  return source;
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** `<YYYYMMDD-HHMMSS>-<port>`, in the local time zone. */
export function recordingFolder(now: Date, port: number): string {
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${date}-${time}-${port}`;
}

/** Process ids from `lsof -Fp` output, in order. */
export function parseLsofPids(output: string): number[] {
  return output
    .split("\n")
    .filter((line) => /^p\d+$/.test(line))
    .map((line) => Number(line.slice(1)));
}

/** The working folder from `lsof -a -p <pid> -d cwd -Fn` output. */
export function parseLsofCwd(output: string): string | undefined {
  const line = output.split("\n").find((l) => l.startsWith("n/"));
  return line?.slice(1);
}
