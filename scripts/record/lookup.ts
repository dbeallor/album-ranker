import { execFileSync } from "node:child_process";
import { groupAlive, listWorktrees, readRecord, recordFiles } from "../preview/index.ts";
import { parseLsofCwd, parseLsofPids, type Listener, type PreviewCandidate } from "./rules.ts";

/** Every preview record in every worktree's `.preview/`, the way `npm run preview -- list` finds them. */
export function previewCandidates(): PreviewCandidate[] {
  const found: PreviewCandidate[] = [];
  for (const worktree of listWorktrees()) {
    for (const file of recordFiles(worktree.path)) {
      const record = readRecord(file);
      if (record) {
        found.push({ record, checkout: worktree.path, alive: groupAlive(record.pid) });
      }
    }
  }
  return found;
}

function run(file: string, args: string[]): string | undefined {
  try {
    return execFileSync(file, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5_000 });
  } catch {
    return undefined;
  }
}

const commandOf = (pid: number) => run("ps", ["-o", "command=", "-p", String(pid)])?.trim() || undefined;

/**
 * The process listening on a TCP port: its working folder and command line, and its parent's command line
 * (`next dev` serves from a child process). A step that fails (no `lsof`, another user's process) leaves its field out.
 */
export function listenerOn(port: number): Listener {
  const [pid] = parseLsofPids(run("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-Fp"]) ?? "");
  if (pid === undefined) {
    return {};
  }
  const listener: Listener = {};
  const cwd = parseLsofCwd(run("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"]) ?? "");
  const command = commandOf(pid);
  const parent = Number(run("ps", ["-o", "ppid=", "-p", String(pid)])?.trim());
  const parentCommand = Number.isInteger(parent) && parent > 1 ? commandOf(parent) : undefined;
  if (cwd) listener.cwd = cwd;
  if (command) listener.command = command;
  if (parentCommand) listener.parentCommand = parentCommand;
  return listener;
}
