// @vitest-environment node
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runSession } from "./session.ts";

// Without an installed Chromium (`npx playwright install chromium`) the test is skipped, so `npm test` still passes.
const hasChromium = await chromium
  .launch()
  .then((browser) => browser.close())
  .then(() => true, () => false);

describe.skipIf(!hasChromium)("runSession", () => {
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html");
    response.end("<!doctype html><title>t</title><button>go</button>");
  });
  let url = "";
  let dir = "";

  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    url = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/`;
    dir = await mkdtemp(join(tmpdir(), "album-record-"));
  });

  afterAll(async () => {
    server.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("logs the first page size as viewport and a later resize in resizes", async () => {
    const outFile = join(dir, "events.json");
    await runSession({
      browser: chromium,
      url,
      viewport: { width: 1000, height: 700 },
      outFile,
      source: { host: new URL(url).host },
      headless: true,
      drive: async (page) => {
        await page.setViewportSize({ width: 600, height: 800 });
        // Past the 250 ms debounce, so the report is sent before the session ends.
        await page.waitForTimeout(600);
      },
    });

    const log = JSON.parse(await readFile(outFile, "utf8"));
    expect(log.viewport).toEqual({ width: 1000, height: 700 });
    expect(log.resizes).toEqual([{ t: expect.any(Number), width: 600, height: 800 }]);
    expect(log.resizes[0].t).toBeGreaterThanOrEqual(0);
  });
});
