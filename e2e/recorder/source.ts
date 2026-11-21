import { execFileSync } from "node:child_process";

export type GitInfo = { branch?: string; worktree?: string; commit?: string };

function git(folder: string, args: string[]): string | undefined {
  try {
    const out = execFileSync("git", ["-C", folder, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5_000,
    }).trim();
    return out === "" ? undefined : out;
  } catch {
    return undefined;
  }
}

/**
 * Branch, checkout path and full HEAD commit of the git checkout that contains `folder`.
 * A field is left out when git can't say: not a checkout, no git, or (for the branch) a detached HEAD.
 */
export function gitInfo(folder: string): GitInfo {
  const info: GitInfo = {};
  const branch = git(folder, ["symbolic-ref", "--short", "-q", "HEAD"]);
  const worktree = git(folder, ["rev-parse", "--show-toplevel"]);
  const commit = git(folder, ["rev-parse", "HEAD"]);
  if (branch) info.branch = branch;
  if (worktree) info.worktree = worktree;
  if (commit) info.commit = commit;
  return info;
}
