import type { EventLog, LogSource, RecordedEvent, SentEvent } from "./recorder.ts";

/** Fills in `seq` and `t` (ms since `startedAtMs`) on the events the browser sent. */
export function toEvents(sent: SentEvent[], startedAtMs: number): RecordedEvent[] {
  return sent.map((event, seq) => {
    const { ts, ...body } = event;
    return { ...body, seq, t: ts - startedAtMs } as RecordedEvent;
  });
}

export type BuildLogInput = {
  sent: SentEvent[];
  startedAtMs: number;
  source: LogSource;
  viewport: { width: number; height: number } | null;
  /** The test's title. Leave it out for a session someone clicked through. */
  test?: string;
};

/** A version 2 log. Fields that are undefined are left out of `source` and the log, never written as null. */
export function buildLog({ sent, startedAtMs, source, viewport, test }: BuildLogInput): EventLog {
  const known = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined)) as LogSource;
  return {
    format: "album-ranker-events",
    version: 2,
    source: known,
    ...(test === undefined ? {} : { test }),
    startedAt: new Date(startedAtMs).toISOString(),
    viewport,
    events: toEvents(sent, startedAtMs),
  };
}
