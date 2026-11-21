import { execFileSync, spawn, spawnSync } from "node:child_process";
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import net from "node:net";
import { join } from "node:path";
import { DatabaseSync, backup } from "node:sqlite";
import {
  MAIN_PORT,
  checkRootOnMain,
  findWorktree,
  parseArgs,
  parseWorktrees,
  ticketNumberOf,
  ticketPort,
  type Command,
  type Result,
  type Target,
  type Worktree,
} from "./rules.ts";

export type PreviewRecord = {
  pid: number;
  port: number;
  target: string;
  branch: string | null;
  startedAt: string;
  /** Full HEAD SHA of the checkout when the preview started (for main, before the build). Missing in records from before ALBUM-30. */
  commit?: string;
};

type StartCommand = Extract<Command, { kind: "start" }>;

const MAIN_TIMEOUT_MS = 3 * 60_000;
const TICKET_TIMEOUT_MS = 60_000;
const STOP_WAIT_MS = 10_000;
const HOST = "127.0.0.1";

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function listWorktrees(): Worktree[] {
  const text = execFileSync("git", ["worktree", "list", "--porcelain"], { encoding: "utf8" });
  return parseWorktrees(text);
}

function previewDir(checkout: string): string {
  return join(checkout, ".preview");
}

export function recordFiles(checkout: string): string[] {
  const dir = previewDir(checkout);
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => join(dir, name));
}

export function readRecord(file: string): PreviewRecord | null {
  try {
    const record = JSON.parse(readFileSync(file, "utf8")) as PreviewRecord;
    return Number.isInteger(record?.pid) && record.pid > 1 ? record : null;
  } catch {
    return null;
  }
}

export function groupAlive(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function waitUntil(done: () => boolean, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (done()) {
      return true;
    }
    await sleep(100);
  }
  return done();
}

/** Stops the process group: SIGTERM, then SIGKILL after 10 seconds. */
async function stopGroup(pid: number, gone: () => boolean = () => !groupAlive(pid)): Promise<void> {
  if (gone()) {
    return;
  }
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    return;
  }
  if (await waitUntil(gone, STOP_WAIT_MS)) {
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    return;
  }
  await waitUntil(gone, STOP_WAIT_MS);
}

/** Stops every preview recorded in a checkout and cleans up stale records. Returns the targets it stopped. */
async function stopCheckout(checkout: string): Promise<string[]> {
  const stopped: string[] = [];
  for (const file of recordFiles(checkout)) {
    const record = readRecord(file);
    if (record && groupAlive(record.pid)) {
      await stopGroup(record.pid);
      stopped.push(record.target);
    }
    rmSync(file, { force: true });
  }
  return stopped;
}

/** True when nothing listens on the port. On macOS a listener on one address doesn't block binding another, so probe each one. */
async function portFree(port: number): Promise<boolean> {
  for (const host of ["::", "0.0.0.0", "127.0.0.1", "::1"]) {
    const code = await new Promise<string>((resolve) => {
      const server = net.createServer();
      server.once("error", (error: NodeJS.ErrnoException) => resolve(error.code ?? "error"));
      server.listen(port, host, () => server.close(() => resolve("free")));
    });
    if (code === "EADDRINUSE") {
      return false;
    }
  }
  return true;
}

async function requirePortFree(port: number, worktrees: Worktree[]): Promise<void> {
  if (await portFree(port)) {
    return;
  }
  for (const worktree of worktrees) {
    for (const file of recordFiles(worktree.path)) {
      const record = readRecord(file);
      if (record && record.port === port && groupAlive(record.pid)) {
        throw new Error(
          `Port ${port} is in use by the preview of ${record.target} (pid ${record.pid}).\n` +
            `Stop it with: npm run preview -- stop ${record.target}`,
        );
      }
    }
  }
  throw new Error(`Port ${port} is in use.\nSee what holds it with: lsof -i :${port}`);
}

function setupCheckout(checkout: string): void {
  const modules = join(checkout, "node_modules");
  const marker = join(modules, ".package-lock.json");
  const lock = join(checkout, "package-lock.json");
  const stale =
    !existsSync(modules) ||
    !existsSync(marker) ||
    (existsSync(lock) && statSync(lock).mtimeMs > statSync(marker).mtimeMs);

  if (stale) {
    console.log(`Running npm install in ${checkout}`);
    const result = spawnSync("npm", ["install"], { cwd: checkout, stdio: "inherit" });
    if (result.status !== 0) {
      throw new Error(`npm install failed in ${checkout}.`);
    }
  }

  const env = join(checkout, ".env");
  const example = join(checkout, ".env.example");
  if (!existsSync(env) && existsSync(example)) {
    copyFileSync(example, env);
    console.log(`Copied .env.example to ${env}`);
  }
}

function removeDatabase(file: string): void {
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(file + suffix, { force: true });
  }
}

async function prepareTicketData(
  command: StartCommand,
  root: Worktree,
  checkout: string,
): Promise<string> {
  const databasePath = join(checkout, "data", "preview.db");
  mkdirSync(join(checkout, "data"), { recursive: true });

  if (command.empty) {
    removeDatabase(databasePath);
    console.log(`Removed ${databasePath}; the preview starts empty.`);
  }
  if (command.copyMainData) {
    const source = join(root.path, "data", "album-ranker.db");
    if (!existsSync(source)) {
      throw new Error(`--copy-main-data needs ${source}, which does not exist.`);
    }
    removeDatabase(databasePath);
    const sourceDb = new DatabaseSync(source, { readOnly: true });
    try {
      await backup(sourceDb, databasePath);
    } finally {
      sourceDb.close();
    }
    console.log(`Copied ${source} to ${databasePath}`);
  }
  return databasePath;
}

function warnIfRootBehind(root: Worktree): void {
  try {
    execFileSync("git", ["-C", root.path, "fetch", "--quiet", "origin"], {
      stdio: "pipe",
      timeout: 15_000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    const behind = execFileSync(
      "git",
      ["-C", root.path, "rev-list", "--count", "main..origin/main"],
      { encoding: "utf8" },
    ).trim();
    if (behind !== "0") {
      console.warn(
        `Warning: ${root.path} is ${behind} commit(s) behind origin/main. Update it with:\n` +
          `  git -C ${root.path} pull --ff-only`,
      );
    }
  } catch {
    console.warn("Warning: could not check origin/main (offline?). Previewing what is checked out.");
  }
}

function tailLog(logFile: string): string {
  try {
    return readFileSync(logFile, "utf8").trimEnd().split("\n").slice(-20).join("\n");
  } catch {
    return "(no log)";
  }
}

/** Main must answer 200; a dev server can answer 500 while a page fails to compile, which still means it is up. */
async function answers(port: number, anyStatus: boolean): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`, {
      signal: AbortSignal.timeout(5_000),
    });
    return anyStatus || response.status === 200;
  } catch {
    return false;
  }
}

type Launch = {
  checkout: string;
  label: string;
  branch: string | null;
  port: number;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  /** Count any HTTP response as up (dev server) instead of requiring 200. */
  anyStatus: boolean;
  /** Command and arguments; the first is run with `cwd` set to the checkout. */
  argv: string[];
};

async function launch(spec: Launch): Promise<void> {
  const dir = previewDir(spec.checkout);
  mkdirSync(dir, { recursive: true });
  const name = spec.label.replace(/[^A-Za-z0-9._-]/g, "-");
  const logFile = join(dir, `${name}.log`);
  const recordFile = join(dir, `${name}.json`);

  const logFd = openSync(logFile, "w");
  const child = spawn(spec.argv[0], spec.argv.slice(1), {
    cwd: spec.checkout,
    env: spec.env,
    detached: true,
    stdio: ["ignore", logFd, logFd],
  });
  closeSync(logFd);
  child.unref();

  let exited = false;
  child.once("exit", () => {
    exited = true;
  });
  if (child.pid === undefined) {
    throw new Error(`Could not start ${spec.argv[0]}.`);
  }
  const pid = child.pid;

  const record: PreviewRecord = {
    pid,
    port: spec.port,
    target: spec.label,
    branch: spec.branch,
    startedAt: new Date().toISOString(),
    commit: headOf(spec.checkout),
  };
  writeFileSync(recordFile, `${JSON.stringify(record, null, 2)}\n`);

  const deadline = Date.now() + spec.timeoutMs;
  let up = false;
  while (!exited && Date.now() < deadline) {
    if (await answers(spec.port, spec.anyStatus)) {
      up = true;
      break;
    }
    await sleep(500);
  }

  if (!up) {
    const reason = exited
      ? "The process exited before the page answered."
      : `The page did not answer within ${spec.timeoutMs / 1000} seconds.`;
    console.error(`${reason} Last log lines (${logFile}):\n${tailLog(logFile)}`);
    await stopGroup(pid);
    rmSync(recordFile, { force: true });
    process.exit(1);
  }

  console.log(`Preview of ${spec.label} is up: http://localhost:${spec.port}`);
  console.log(`Log: ${logFile}`);
}

async function start(command: StartCommand): Promise<void> {
  const worktrees = listWorktrees();
  const nextBin = (checkout: string) => join(checkout, "node_modules", ".bin", "next");

  if (command.target.kind === "main") {
    const root = unwrap(checkRootOnMain(worktrees));
    await stopCheckout(root.path);
    await requirePortFree(MAIN_PORT, worktrees);
    warnIfRootBehind(root);
    setupCheckout(root.path);

    const env: NodeJS.ProcessEnv = { ...process.env, PORT: String(MAIN_PORT) };
    delete env.DATABASE_PATH;
    console.log("Building and starting main; the build can take a few minutes.");
    await launch({
      checkout: root.path,
      label: "main",
      branch: "main",
      port: MAIN_PORT,
      env,
      timeoutMs: MAIN_TIMEOUT_MS,
      anyStatus: false,
      argv: [
        "sh",
        "-c",
        '"$0" build && exec "$0" start --port "$1" --hostname "$2"',
        nextBin(root.path),
        String(MAIN_PORT),
        HOST,
      ],
    });
    return;
  }

  const root = worktrees[0];
  if (!root) {
    throw new Error("Could not find the root checkout in git worktree list.");
  }
  const found = unwrap(findWorktree(worktrees, command.target as Exclude<Target, { kind: "main" }>));
  if (found.path === root.path) {
    throw new Error(`${found.path} is the root checkout; use "main" to preview it.`);
  }
  const branch = found.branch as string;
  const ticket = ticketNumberOf(branch);
  const port = unwrap(ticketPort(ticket, command.port));
  const label = ticket === null ? branch : String(ticket);

  await stopCheckout(found.path);
  await requirePortFree(port, worktrees);
  setupCheckout(found.path);
  const databasePath = await prepareTicketData(command, root, found.path);

  console.log(`Starting ${branch} on port ${port} with data in ${databasePath}`);
  await launch({
    checkout: found.path,
    label,
    branch,
    port,
    env: { ...process.env, PORT: String(port), DATABASE_PATH: databasePath },
    timeoutMs: TICKET_TIMEOUT_MS,
    anyStatus: true,
    argv: [nextBin(found.path), "dev", "--port", String(port), "--hostname", HOST],
  });
}

/** The full HEAD SHA, or undefined when git can't say. */
function headOf(checkout: string): string | undefined {
  try {
    return execFileSync("git", ["-C", checkout, "rev-parse", "HEAD"], { encoding: "utf8" }).trim() || undefined;
  } catch {
    return undefined;
  }
}

function commitOf(checkout: string): string {
  try {
    return execFileSync("git", ["-C", checkout, "rev-parse", "--short", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "?";
  }
}

function list(): void {
  const rows: string[][] = [];
  for (const worktree of listWorktrees()) {
    for (const file of recordFiles(worktree.path)) {
      const record = readRecord(file);
      if (!record || !groupAlive(record.pid)) {
        rmSync(file, { force: true });
        continue;
      }
      rows.push([
        record.target,
        String(record.port),
        `http://localhost:${record.port}`,
        String(record.pid),
        commitOf(worktree.path),
      ]);
    }
  }
  if (rows.length === 0) {
    console.log("No previews running.");
    return;
  }
  const table = [["TARGET", "PORT", "URL", "PID", "COMMIT"], ...rows];
  const widths = table[0].map((_, column) => Math.max(...table.map((row) => row[column].length)));
  for (const row of table) {
    console.log(row.map((cell, column) => cell.padEnd(widths[column])).join("  ").trimEnd());
  }
}

async function stop(command: Extract<Command, { kind: "stop" }>): Promise<void> {
  const worktrees = listWorktrees();
  let checkouts: Worktree[];

  if (command.target.kind === "all") {
    checkouts = worktrees;
  } else if (command.target.kind === "main") {
    checkouts = [worktrees[0]];
  } else {
    checkouts = [unwrap(findWorktree(worktrees, command.target))];
  }

  let count = 0;
  for (const checkout of checkouts) {
    for (const target of await stopCheckout(checkout.path)) {
      console.log(`Stopped the preview of ${target}.`);
      count++;
    }
  }
  if (count === 0) {
    console.log("No matching preview was running.");
  }
}

export async function main(argv: string[]): Promise<void> {
  const command = unwrap(parseArgs(argv));
  if (command.kind === "start") {
    await start(command);
  } else if (command.kind === "list") {
    list();
  } else {
    await stop(command);
  }
}
