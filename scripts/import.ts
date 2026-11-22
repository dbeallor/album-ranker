// Imports the Albums sheet of a spreadsheet: `npm run import -- "/path/to/Best Albums.xlsx"`.
// Run through `node --conditions=react-server`, which makes the `server-only` marker package resolve to its
// empty module, so the catalog client loads outside Next.js. See the README.
import { createResolveCover } from "../lib/catalog/cover-art.ts";
import { createMusicBrainzClient } from "../lib/catalog/musicbrainz.ts";
import { getConfig } from "../lib/config.ts";
import { openDatabase } from "../lib/db/connection.ts";
import { ImportInputError, readAlbumsSheet } from "../lib/import/read-sheet.ts";
import { prepareRows } from "../lib/import/rows.ts";
import { runImport } from "../lib/import/run.ts";
import { formatSummary } from "../lib/import/summary.ts";

const path = process.argv[2];
if (!path || process.argv.length > 3) {
  console.error('Usage: npm run import -- "/path/to/Best Albums.xlsx"');
  process.exit(1);
}

const { databasePath, musicbrainzUserAgent, musicbrainzUrl, coverArtArchiveUrl, deezerUrl } = getConfig();
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const client = createMusicBrainzClient({
  fetch: (input, init) => fetch(input, init),
  now: Date.now,
  sleep,
  userAgent: () => musicbrainzUserAgent,
  baseUrl: () => musicbrainzUrl,
});

const resolveCover = createResolveCover({
  fetch: (input, init) => fetch(input, init),
  userAgent: () => musicbrainzUserAgent,
  caaUrl: () => coverArtArchiveUrl,
  deezerUrl: () => deezerUrl,
  log: (message, detail) => console.error(...(detail === undefined ? [message] : [message, detail])),
});

let db: ReturnType<typeof openDatabase> | undefined;
try {
  // Read the file before opening the database, so a bad path or sheet leaves no database file behind.
  const prepared = prepareRows(await readAlbumsSheet(path));
  db = openDatabase(databasePath);
  console.log(`Importing ${prepared.rows.length} rows from ${path} into ${databasePath}`);
  const summary = await runImport(db, prepared, {
    search: (query) => client.searchReleaseGroups(query),
    sleep,
    resolveCover,
    onProgress: (done, total) => console.log(`Processed ${done} of ${total} rows`),
    onCatalogError: (row, error) =>
      console.error(`Catalog error on row ${row.rowNumber}: ${error instanceof Error ? error.message : String(error)}`),
  });
  console.log(`\n${formatSummary(summary)}`);
  process.exitCode = summary.aborted ? 1 : 0;
} catch (error) {
  if (error instanceof ImportInputError) {
    console.error(error.message);
    process.exitCode = 1;
  } else {
    throw error;
  }
} finally {
  db?.close();
}
