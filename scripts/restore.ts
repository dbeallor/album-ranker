import { createInterface } from "node:readline/promises";
import { getConfig } from "../lib/config.ts";
import { resolveBackupFile, restoreDatabase, type Counts, type RestoreSummary } from "../lib/db/backup.ts";

const { databasePath, backupDir } = getConfig();

function describe(counts: Counts): string {
  return `${counts.albums} albums, ${counts.yearEntries} year entries, ${counts.matchups} matchups`;
}

async function confirmReplace(summary: RestoreSummary, yes: boolean): Promise<boolean> {
  console.log(`A database already exists at ${summary.targetPath}.`);
  console.log(`  Now:     ${summary.currentUnreadable ? "unreadable (damaged); its files are kept before it is replaced" : describe(summary.current)}`);
  console.log(`  Backup:  ${describe(summary.backup)}`);
  for (const warning of summary.warnings) console.warn(`Warning: ${warning}`);
  if (yes) return true;
  if (!process.stdin.isTTY) {
    throw new Error("Not replacing it: there is no terminal to ask in. Run again in a terminal, or pass --yes.");
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question("Type yes to replace it: ")).trim() === "yes";
  } finally {
    rl.close();
  }
}

async function main(args: string[]): Promise<void> {
  const yes = args.includes("--yes");
  const positional = args.filter((arg) => arg !== "--yes");
  if (positional.length !== 1) {
    throw new Error("Usage: npm run db:restore -- <latest | backup file> [--yes]");
  }

  const backupFile = resolveBackupFile(positional[0], databasePath, backupDir);
  console.log(`Restoring ${backupFile} to ${databasePath}`);
  console.log("Stop the app first (npm run dev, and any preview using this file).");

  const result = await restoreDatabase({
    backupFile,
    targetPath: databasePath,
    backupDir,
    confirm: (summary) => confirmReplace(summary, yes),
  });

  if (result.restored && !result.preRestorePath) {
    for (const warning of result.summary.warnings) console.warn(`Warning: ${warning}`);
  }
  if (!result.restored) {
    throw new Error("Not replaced. Nothing was changed.");
  }
  console.log(`Restored ${describe(result.summary.backup)} to ${databasePath}`);
  if (result.preRestorePath) {
    console.log(`The data it replaced is kept at ${result.preRestorePath}`);
    console.log(`To undo this restore: npm run db:restore -- ${result.preRestorePath}`);
  }
}

try {
  await main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
