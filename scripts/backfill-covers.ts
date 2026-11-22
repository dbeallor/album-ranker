// Fills the cover of albums saved without one and replaces dead Cover Art Archive links: `npm run backfill-covers`.
// Run through `node --conditions=react-server`, like the import. See the README.
import { backfillCovers, formatBackfillSummary, LOOKUP_GAP_MS } from "../lib/catalog/backfill-covers.ts";
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
  const { missing } = db.prepare("SELECT COUNT(*) AS missing FROM albums WHERE cover_url IS NULL").get() as { missing: number };
  const { links } = db.prepare("SELECT COUNT(*) AS links FROM albums WHERE cover_url LIKE 'https://coverartarchive.org/%'").get() as { links: number };
  console.log(`Checking ${missing} albums with no cover and ${links} Cover Art Archive links in ${databasePath}`);
  // An estimate: albums with no catalog id or another kind of link are not looked up, so it can finish sooner.
  console.log(`This makes about one request a second, so allow about ${Math.max(1, Math.ceil(((missing + links) * LOOKUP_GAP_MS) / 60_000))} minutes.`);
  const result = await backfillCovers(db, {
    lookupCover,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => Date.now(),
    onProgress: (done, total) => console.log(`Checked ${done} of ${total} albums`),
  });
  console.log(`\n${formatBackfillSummary(result)}`);
} finally {
  db.close();
}
