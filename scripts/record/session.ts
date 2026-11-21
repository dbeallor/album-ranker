import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { BrowserType, Page } from "@playwright/test";
import { recorderScript } from "../../e2e/recorder/inject.ts";
import { buildLog } from "../../e2e/recorder/log.ts";
import type { LogSource, SentEvent } from "../../e2e/recorder/recorder.ts";

export type SessionOptions = {
  /** Playwright's `chromium`. A script can pass it with `headless: true`. */
  browser: BrowserType;
  url: string;
  viewport: { width: number; height: number };
  outFile: string;
  source: LogSource;
  now?: () => number;
  headless?: boolean;
  /** Ends the session like closing the window does. */
  signal?: AbortSignal;
  /** Drives the page for a scripted session. The session ends when this resolves. */
  drive?: (page: Page) => Promise<void>;
  /** At most one rewrite of the log per this many ms while events arrive. */
  saveEveryMs?: number;
};

export type SessionResult = { file: string; events: number };

// Room for the browser's own toolbar, so a headed window shows the whole viewport.
const WINDOW_CHROME_HEIGHT = 130;

/**
 * Opens a browser on `url`, records what happens in its pages and writes the log to `outFile`
 * when the window closes, the signal aborts or `drive` finishes. While events arrive it also
 * rewrites the log at most once a second, so a killed process keeps the events up to then.
 */
export async function runSession(options: SessionOptions): Promise<SessionResult> {
  const { browser, url, viewport, outFile, source, signal, drive } = options;
  const now = options.now ?? Date.now;
  const saveEveryMs = options.saveEveryMs ?? 1_000;
  const headless = options.headless ?? false;

  const sent: SentEvent[] = [];
  const openedAtMs = now();
  // `t` counts from the first event, so a log starts at 0.
  const startedAtMs = () => sent[0]?.ts ?? openedAtMs;

  const save = async (): Promise<void> => {
    const log = buildLog({ sent, startedAtMs: startedAtMs(), source, viewport });
    await mkdir(dirname(outFile), { recursive: true });
    // Write beside the file and rename, so a kill mid-write never leaves half a log.
    const partial = `${outFile}.partial`;
    await writeFile(partial, `${JSON.stringify(log, null, 2)}\n`);
    await rename(partial, outFile);
  };

  let timer: NodeJS.Timeout | undefined;
  let lastSaveMs = 0;
  let saving: Promise<void> = Promise.resolve();
  const saveSoon = (): void => {
    if (timer) {
      return;
    }
    const wait = Math.max(0, lastSaveMs + saveEveryMs - Date.now());
    timer = setTimeout(() => {
      timer = undefined;
      lastSaveMs = Date.now();
      saving = saving.then(save).catch(() => {});
    }, wait);
  };

  const instance = await browser.launch({
    headless,
    // The command handles Ctrl-C itself so the log is written; Playwright's own handlers would exit first.
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
    args: headless ? [] : [`--window-size=${viewport.width},${viewport.height + WINDOW_CHROME_HEIGHT}`],
  });
  const closed = new Promise<void>((resolve) => instance.once("disconnected", () => resolve()));

  try {
    const context = await instance.newContext({ viewport });
    await context.exposeBinding("__albumRecorderSend", (_source, event: SentEvent) => {
      sent.push(event);
      saveSoon();
    });
    await context.addInitScript({ content: recorderScript() });

    const page = await context.newPage();
    const abort = () => void instance.close().catch(() => {});
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) {
      abort();
    }

    await page.goto(url);
    if (drive) {
      await drive(page);
      // Events reach this process through an async binding; give the last ones time to land.
      await page.waitForTimeout(300);
      await instance.close();
    }
    await closed;
  } finally {
    await instance.close().catch(() => {});
    if (timer) {
      clearTimeout(timer);
    }
    await saving;
    await save();
  }

  return { file: outFile, events: sent.length };
}
