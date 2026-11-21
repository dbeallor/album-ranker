import { chromium } from "@playwright/test";
import { join, resolve } from "node:path";
import { gitInfo } from "../e2e/recorder/source.ts";
import { listenerOn, previewCandidates } from "./record/lookup.ts";
import {
  matchPreviewByPort,
  matchPreviewByTarget,
  parseArgs,
  portOf,
  previewCommandFor,
  recordingFolder,
  buildSource,
  type PreviewMatch,
} from "./record/rules.ts";
import { runSession } from "./record/session.ts";

async function answers(url: string): Promise<boolean> {
  try {
    await fetch(url, { signal: AbortSignal.timeout(5_000) });
    return true;
  } catch {
    return false;
  }
}

async function main(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  const command = parsed.value;

  let url: string;
  let match: PreviewMatch = { state: "none" };
  if (command.target.kind === "preview") {
    const { target } = command.target;
    match = matchPreviewByTarget(previewCandidates(), target);
    if (match.state !== "live") {
      throw new Error(`That preview is not running.\nStart it with: ${previewCommandFor(target)}`);
    }
    url = `http://localhost:${match.record.port}`;
  } else {
    url = command.target.url;
    match = matchPreviewByPort(previewCandidates(), portOf(url));
  }

  if (!(await answers(url))) {
    throw new Error(`Nothing answers at ${url}. Start the app first, for example: npm run dev`);
  }

  const port = portOf(url);
  const preview = match.state === "live" ? { record: match.record, checkout: match.checkout } : undefined;
  const listener = preview ? undefined : listenerOn(port);
  const folder = preview?.checkout ?? listener?.cwd;
  const source = buildSource({ url, preview, listener, git: folder ? gitInfo(folder) : {} });

  const folderName = recordingFolder(new Date(), port);
  const outFile = join(command.out ? resolve(command.out) : resolve("recordings", folderName), "events.json");

  const abort = new AbortController();
  process.once("SIGINT", () => abort.abort());
  process.once("SIGTERM", () => abort.abort());

  console.log(`Recording ${url}. Close the browser window or press Ctrl-C to stop.`);
  const result = await runSession({
    browser: chromium,
    url,
    viewport: command.viewport,
    outFile,
    source,
    signal: abort.signal,
  });
  console.log(`Saved ${result.events} events to ${result.file}`);
}

try {
  await main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
