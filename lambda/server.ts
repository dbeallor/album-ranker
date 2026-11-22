// Entry for S3 storage mode: `node lambda/server.ts` from the packaged app's root, with server.js (the Next.js standalone
// server) one folder up. Runs as TypeScript through Node 24's type stripping, which works because none of the files
// involved sit under node_modules and they use only erasable syntax. See lib/db/s3-sync.ts for how it fits together.
import http from "node:http";
import { fileURLToPath } from "node:url";
import { getConfig } from "../lib/config.ts";
import { createAwsObjectStore } from "../lib/db/s3-store.ts";
import { createS3Sync, serveWithSync, shareSync } from "../lib/db/s3-sync.ts";

const config = getConfig();

if (config.databaseS3) {
  const sync = createS3Sync({
    store: createAwsObjectStore(config.databaseS3),
    path: config.databasePath,
    migrationsDir: fileURLToPath(new URL("../lib/db/migrations", import.meta.url)),
  });
  shareSync(sync);

  // server.js builds its HTTP server with `http.createServer(requestListener)`; wrap that listener.
  const createServer = http.createServer.bind(http) as (...args: unknown[]) => http.Server;
  (http as { createServer: unknown }).createServer = (...args: unknown[]) => {
    const at = args.findIndex((arg) => typeof arg === "function");
    if (at === -1) return createServer(...args);
    const wrapped = serveWithSync(args[at] as Parameters<typeof serveWithSync>[0], sync);
    return createServer(...args.slice(0, at), wrapped, ...args.slice(at + 1));
  };
  console.log(`[s3-sync] Database stored at s3://${config.databaseS3.bucket}/${config.databaseS3.key}, working copy ${config.databasePath}.`);
} else {
  console.log("[s3-sync] DATABASE_S3_BUCKET and DATABASE_S3_KEY are not set; using the local database file.");
}

// A variable, so the type checker doesn't look for server.js, which exists only in the standalone build.
await import(new URL("../server.js", import.meta.url).href);
