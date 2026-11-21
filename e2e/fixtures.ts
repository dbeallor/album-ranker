import { writeFile } from "node:fs/promises";
import { test as base, expect } from "@playwright/test";
import { recorderScript } from "./recorder/inject";
import type { EventLog, RecordedEvent, SentEvent } from "./recorder/recorder";

export type RecordedEvents = {
  /** The log so far, in arrival order, with `seq` and `t` filled in. */
  snapshot(): RecordedEvent[];
};

export { expect };

function toLog(sent: SentEvent[], startedAtMs: number): RecordedEvent[] {
  return sent.map((event, seq) => {
    const { ts, ...body } = event;
    return { ...body, seq, t: ts - startedAtMs } as RecordedEvent;
  });
}

export const test = base.extend<{ recorded: RecordedEvents }>({
  recorded: [
    async ({ context }, use, testInfo) => {
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

      await use({ snapshot: () => toLog(sent, startedAtMs()) });

      const log: EventLog = {
        format: "album-ranker-events",
        version: 1,
        test: testInfo.titlePath.slice(1).join(": "),
        startedAt: new Date(startedAtMs()).toISOString(),
        viewport: context.pages()[0]?.viewportSize() ?? null,
        events: toLog(sent, startedAtMs()),
      };
      const file = testInfo.outputPath("events.json");
      await writeFile(file, `${JSON.stringify(log, null, 2)}\n`);
      await testInfo.attach("events.json", { path: file, contentType: "application/json" });
    },
    { auto: true },
  ],
});
