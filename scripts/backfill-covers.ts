// Fills the cover of albums saved without one: `npm run backfill-covers`.
// Run through `node --conditions=react-server`, like the import. See the README.
import { backfillCovers, formatBackfillSummary } from "../lib/catalog/backfill-covers.ts";
import { createLookupCover } from "../lib/catalog/cover-art.ts";
import { getConfig } from "../lib/config.ts";
import { openDatabase } from "../lib/db/connection.ts";

if (process.argv.length > 2) {
  console.error("Usage: npm run backfill-covers");
  process.exit(1);
}

const { databasePath, musicbrainzUserAgent, coverArtArchiveUrl, deezerUrl } = getConfig();

const lookupCover = createLookupCover({
  fetch: (input, init) => fetch(input, init),
  userAgent: () => musicbrainzUserAgent,
  caaUrl: () => coverArtArchiveUrl,
  deezerUrl: () => deezerUrl,
  log: (message, detail) => console.error(...(detail === undefined ? [message] : [message, detail])),
});

const db = openDatabase(databasePath);
try {
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM albums WHERE cover_url IS NULL").get() as { n: number };
  console.log(`Checking ${n} albums with no cover in ${databasePath}`);
  const summary = await backfillCovers(db, {
    lookupCover,
    onProgress: (done, total) => console.log(`Checked ${done} of ${total} albums`),
  });
  console.log(`\n${formatBackfillSummary(summary)}`);
} finally {
  db.close();
}
