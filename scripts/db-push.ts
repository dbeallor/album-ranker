import { S3Client } from "@aws-sdk/client-s3";
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { getDataPaths } from "../lib/config.ts";
import { createAwsObjectStore } from "../lib/db/s3-store.ts";
import type { ObjectStore } from "../lib/db/s3-sync.ts";
import { describeCounts, pushDatabase, type DeployTarget, type PushSummary, type Side } from "../lib/db/push.ts";

const KEY = "album-ranker.db";

export const USAGE =
  "Usage: npm run db:push -- <staging|production> [--dry-run] [--bucket <name>] [--region <region>] [--expect-etag <etag>] [--yes] [--confirm-production]";

export type Args = {
  environment: DeployTarget;
  dryRun: boolean;
  bucket?: string;
  region?: string;
  expectEtag?: string;
  yes: boolean;
};

const VALUE_FLAGS = { "--bucket": "bucket", "--region": "region", "--expect-etag": "expectEtag" } as const;

/** Reads the command line. Throws the usage line, or what is wrong, before anything else runs. */
export function parseArgs(argv: string[]): Args {
  const environments: string[] = [];
  const values: { bucket?: string; region?: string; expectEtag?: string } = {};
  let dryRun = false;
  let yes = false;
  let confirmProduction = false;

  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = argv[i].startsWith("--") ? splitOnce(argv[i]) : [argv[i], undefined];
    if (flag === "staging" || flag === "production") environments.push(flag);
    else if (flag === "--dry-run") dryRun = true;
    else if (flag === "--yes") yes = true;
    else if (flag === "--confirm-production") confirmProduction = true;
    else if (flag in VALUE_FLAGS) {
      const value = inline ?? argv[++i];
      if (!value || value.startsWith("--")) throw new Error(`${flag} needs a value.\n${USAGE}`);
      values[VALUE_FLAGS[flag as keyof typeof VALUE_FLAGS]] = value;
    } else throw new Error(`Unknown argument: ${argv[i]}\n${USAGE}`);
  }

  if (environments.length !== 1) throw new Error(`Name exactly one environment, staging or production.\n${USAGE}`);
  const environment = environments[0] as DeployTarget;
  if (environment === "production" && !confirmProduction) {
    throw new Error(`Pushing to production needs --confirm-production.\n${USAGE}`);
  }
  return { environment, dryRun, yes, ...values };
}

function splitOnce(arg: string): [string, string | undefined] {
  const at = arg.indexOf("=");
  return at === -1 ? [arg, undefined] : [arg.slice(0, at), arg.slice(at + 1)];
}

/** Everything `run` reaches outside itself through, so a test can stand in for Terraform, AWS and the terminal. */
export type Deps = {
  /** Read only after the arguments check out, so a bad flag is reported before any unrelated setting can fail. */
  localPaths(): { databasePath: string; backupDir: string };
  terraformBucket(environment: DeployTarget): string;
  createStore(target: { bucket: string; key: string }, region: string | undefined): ObjectStore;
  /** Asks for the typed `yes`. */
  ask(question: string): Promise<boolean>;
  isTerminal: boolean;
  log(message: string): void;
  warn(message: string): void;
};

function sideLine(side: Side): string {
  return `${describeCounts(side.counts)}; migrations ${side.versions.join(", ") || "none"}`;
}

function showSummary(summary: PushSummary, deps: Deps, databasePath: string, target: string): void {
  deps.log(`  Local:   ${databasePath}: ${sideLine(summary.local)}`);
  const { remote } = summary;
  if (!remote) {
    deps.log(`  Remote:  ${target}: nothing stored yet`);
  } else {
    const detail = `ETag ${remote.etag}${remote.versionId ? `, version ${remote.versionId}` : ""}${remote.lastModified ? `, last modified ${remote.lastModified.toISOString()}` : ""}`;
    if (remote.data) deps.log(`  Remote:  ${target}: ${sideLine(remote.data)}\n           ${detail}`);
    else deps.log(`  Remote:  ${target}: not an album-ranker database (${remote.unreadable}). The upload would replace it.\n           ${detail}`);
  }
  for (const warning of summary.warnings) deps.warn(`Warning: ${warning}`);
}

/** Runs one push from a command line. Throws on any refusal; the caller prints the message and exits 1. */
export async function run(argv: string[], deps: Deps): Promise<void> {
  const args = parseArgs(argv);
  const { databasePath, backupDir } = deps.localPaths();
  const bucket = args.bucket ?? deps.terraformBucket(args.environment);
  const target = `s3://${bucket}/${KEY}`;
  deps.log(`${args.dryRun ? "Dry run for" : "Pushing to"} ${args.environment}: ${target}`);

  let shown = false;
  const result = await pushDatabase({
    store: deps.createStore({ bucket, key: KEY }, args.region),
    environment: args.environment,
    bucket,
    key: KEY,
    region: args.region,
    databasePath,
    backupDir,
    dryRun: args.dryRun,
    expectEtag: args.expectEtag,
    log: deps.log,
    confirm: async (summary) => {
      showSummary(summary, deps, databasePath, target);
      shown = true;
      if (args.yes) return true;
      if (!deps.isTerminal) {
        throw new Error("Not uploading: there is no terminal to ask in. Run again in a terminal, or pass --yes. Nothing was changed.");
      }
      return deps.ask("Type yes to replace the deployed data: ");
    },
  });
  if (!shown) showSummary(result.summary, deps, databasePath, target);

  if (result.dryRun) {
    deps.log("Dry run: nothing was uploaded.");
    deps.log("To upload, run:");
    deps.log(`  ${result.nextCommand}`);
    return;
  }

  const uploaded = result.uploaded!;
  deps.log(`Uploaded ${describeCounts(uploaded.counts)}. New ETag ${uploaded.etag}${uploaded.versionId ? `, version ${uploaded.versionId}` : ""}.`);
  if (result.previousVersionId) deps.log(`The data it replaced is version ${result.previousVersionId}.`);
  deps.log("The app loads it on its next request and applies any pending migrations.");
  if (result.undo?.commands.length) {
    deps.log("To undo this push, restoring the old copy replaces whatever is in the bucket now, including anything written since this push (answers given in the app, for example).");
    deps.log("Check what is there first, with this command (compare its VersionId to the new version above) or in the app:");
    deps.log(`  ${result.undo.check}`);
    deps.log("Then, to undo (the first fetches the old copy to inspect, the second restores it in place):");
    for (const command of result.undo.commands) deps.log(`  ${command}`);
  }
  if (result.undo?.note) deps.warn(result.undo.note);
}

function terraformBucket(environment: DeployTarget): string {
  try {
    const output = execFileSync("terraform", [`-chdir=infra/envs/${environment}`, "output", "-raw", "data_bucket"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    if (!output) throw new Error("it printed no bucket name");
    return output;
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr?.trim();
    const reason = stderr || (error instanceof Error ? error.message : String(error));
    throw new Error(`Could not read the ${environment} data bucket from Terraform: ${reason}\nPass it yourself with --bucket <name>.`);
  }
}

/** Ctrl-C or Ctrl-D at the prompt is a no, so `pushDatabase` finishes normally and removes its temp folder. */
async function ask(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const stop = new AbortController();
  rl.once("SIGINT", () => stop.abort());
  rl.once("close", () => stop.abort());
  try {
    return (await rl.question(question, { signal: stop.signal })).trim() === "yes";
  } catch (error) {
    if ((error as { name?: string }).name !== "AbortError") throw error;
    console.log();
    return false;
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  // Ctrl-C outside the prompt: exit through the normal path so `pushDatabase` clears its temp folder.
  process.once("SIGINT", () => {
    console.error("\nInterrupted.");
    process.exit(130);
  });
  await run(process.argv.slice(2), {
    localPaths: getDataPaths,
    terraformBucket,
    createStore: (target, region) => createAwsObjectStore(target, new S3Client({ region, followRegionRedirects: true })),
    ask,
    isTerminal: Boolean(process.stdin.isTTY),
    log: (message) => console.log(message),
    warn: (message) => console.warn(message),
  });
}

// Only when run as the script, so a test can import `parseArgs` and `run` without starting a push.
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
