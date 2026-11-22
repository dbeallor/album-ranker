// Stand-in for MusicBrainz, the Cover Art Archive and Deezer, run by playwright.config.ts so the app's server
// never calls a live service. Answers the release-group search with the checked-in fixture, has no cover
// art, and finds no Deezer album, so the placeholder shows.
import { readFileSync } from "node:fs";
import { createServer } from "node:http";

const port = Number(process.env.CATALOG_STUB_PORT ?? 3101);
const fixture = readFileSync(new URL("../lib/catalog/fixtures/getz-gilberto.json", import.meta.url), "utf8");

const server = createServer((request, response) => {
  const { pathname } = new URL(request.url ?? "/", "http://stub.local");

  if (pathname === "/ws/2/release-group") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(fixture);
    return;
  }
  if (pathname.startsWith("/release-group/")) {
    response.writeHead(404);
    response.end();
    return;
  }
  if (pathname === "/search/album") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ data: [], total: 0 }));
    return;
  }
  if (pathname === "/") {
    response.writeHead(200, { "Content-Type": "text/plain" });
    response.end("catalog stub");
    return;
  }
  response.writeHead(404);
  response.end();
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Catalog stub on http://127.0.0.1:${port}`);
});
