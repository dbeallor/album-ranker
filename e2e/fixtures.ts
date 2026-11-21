import { writeFile } from "node:fs/promises";
import { test as base, expect } from "@playwright/test";
import { recorderScript } from "./recorder/inject.ts";
import { buildLog } from "./recorder/log.ts";
import type { EventLog, LogSource, RecordedEvent, SentEvent } from "./recorder/recorder.ts";
import { gitInfo } from "./recorder/source.ts";

export type RecordedEvents = {
  /** The log so far, in arrival order, with `seq` and `t` filled in. */
  snapshot(): RecordedEvent[];
  /** The log as it would be written now. */
  log(): EventLog;
};

export { expect };

export const test = base.extend<{ recorded: RecordedEvents }>({
  recorded: [
    async ({ context, baseURL }, use, testInfo) => {
      if (!baseURL) {
        throw new Error("The recorder needs baseURL in the Playwright config.");
      }
      const sent: SentEvent[] = [];
      const fixtureStartedMs = Date.now();
      // `t` counts from the first event, so a log starts at 0.
      const startedAtMs = () => sent[0]?.ts ?? fixtureStartedMs;

      await context.exposeBinding("__albumRecorderSend", (_source, event: SentEvent) => {
        sent.push(event);
      });
      await context.addInitScript({ content: recorderScript() });
      // Covers come from Cover Art Archive; answer 404 so the placeholder shows and nothing leaves the machine.
      await context.route("https://coverartarchive.org/**", (route) => route.fulfill({ status: 404 }));

      const source: LogSource = { kind: "playwright", host: new URL(baseURL).host, ...gitInfo(process.cwd()) };
      const log = (): EventLog =>
        buildLog({
          sent,
          startedAtMs: startedAtMs(),
          source,
          viewport: context.pages()[0]?.viewportSize() ?? null,
          test: testInfo.titlePath.slice(1).join(": "),
        });

      await use({ snapshot: () => log().events, log });

      const file = testInfo.outputPath("events.json");
      await writeFile(file, `${JSON.stringify(log(), null, 2)}\n`);
      await testInfo.attach("events.json", { path: file, contentType: "application/json" });
    },
    { auto: true },
  ],
});
