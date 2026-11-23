// Field rules for front-end events (ALBUM-85). Pure: no Node or browser APIs, so the browser and the events
// Lambda handler run the same code. Anything that does not match a rule is dropped, never passed through.

export type EventBase = {
  /** ISO time from the browser clock. */
  t: string;
  /** Counter per browser tab. */
  seq: number;
  /** Random id per browser tab. Not the session cookie. */
  session: string;
};

export type ClientEvent =
  | (EventBase & { type: "page"; path: string; vw: number })
  | (EventBase & { type: "click"; tag: string; href?: string; name?: string })
  | (EventBase & { type: "submit"; name?: string })
  | (EventBase & {
      type: "error";
      kind: "error" | "rejection";
      message: string;
      source?: string;
      line?: number;
      col?: number;
      stack?: string;
    })
  | (EventBase & { type: "request-failed"; method: string; path: string; status: number });

export const MAX_BATCH_EVENTS = 100;
export const MAX_MESSAGE = 300;
export const MAX_STACK = 2000;
const MAX_PATH = 200;
const MAX_NAME = 100;
const MAX_TAG = 20;

const SESSION_ID = /^[A-Za-z0-9-]{1,64}$/;
const TAG = /^[a-z][a-z0-9-]*$/;
const METHOD = /^[A-Za-z]{1,10}$/;
const ORIGIN = /\b[a-z][a-z0-9+.-]*:\/\/[^\s/'"()<>]*/gi;
// A `?query` or `#hash` on a path-like token, up to the end of the token. A trailing `:line:col` is kept.
const QUERY_OR_HASH = /(\/[^\s?#'"()<>]*)[?#][^\s'"()<>]*?((?::\d+){0,2})(?=[\s'"()<>]|$)/g;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonNegativeInt(value: unknown, max = Number.MAX_SAFE_INTEGER): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max ? value : undefined;
}

/** A pathname: no origin, query string or hash. Anything that is not a path on this site is `"external"`. */
export function cleanPathname(value: unknown): string | undefined {
  if (typeof value !== "string" || value === "") return undefined;
  if (!value.startsWith("/") || value.startsWith("//")) return "external";
  const end = value.search(/[?#]/);
  return (end === -1 ? value : value.slice(0, end)).slice(0, MAX_PATH);
}

/**
 * Removes every `scheme://host:port` so the page's own origin never reaches the log, then removes the `?query` and
 * `#hash` of path-like tokens (keeping a trailing `:line:col`), then clips.
 */
export function cleanText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.replace(ORIGIN, "").replace(QUERY_OR_HASH, "$1$2").slice(0, max);
  return text === "" ? undefined : text;
}

function cleanName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const name = value.trim().slice(0, MAX_NAME);
  return name === "" ? undefined : name;
}

function cleanTime(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 40) return undefined;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? undefined : new Date(time).toISOString();
}

/** Keeps only the keys whose value is defined, so a dropped optional field is absent rather than `undefined`. */
function defined<T extends Record<string, unknown>>(fields: T): T {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as T;
}

export function cleanEvent(raw: unknown): ClientEvent | null {
  if (!isRecord(raw)) return null;
  const t = cleanTime(raw.t);
  const seq = nonNegativeInt(raw.seq);
  const session = typeof raw.session === "string" && SESSION_ID.test(raw.session) ? raw.session : undefined;
  if (t === undefined || seq === undefined || session === undefined) return null;
  const base = { t, seq, session };

  switch (raw.type) {
    case "page": {
      const path = cleanPathname(raw.path);
      if (path === undefined || typeof raw.vw !== "number" || !Number.isFinite(raw.vw) || raw.vw < 0) return null;
      return { type: "page", ...base, path, vw: Math.round(raw.vw) };
    }
    case "click": {
      const tag = typeof raw.tag === "string" ? raw.tag.toLowerCase().slice(0, MAX_TAG) : "";
      if (!TAG.test(tag)) return null;
      return defined({ type: "click" as const, ...base, tag, href: cleanPathname(raw.href), name: cleanName(raw.name) });
    }
    case "submit":
      return defined({ type: "submit" as const, ...base, name: cleanName(raw.name) });
    case "error": {
      const kind = raw.kind;
      if (kind !== "error" && kind !== "rejection") return null;
      return defined<Extract<ClientEvent, { type: "error" }>>({
        type: "error",
        ...base,
        kind,
        message: cleanText(raw.message, MAX_MESSAGE) ?? "",
        source: cleanPathname(raw.source),
        line: nonNegativeInt(raw.line),
        col: nonNegativeInt(raw.col),
        stack: cleanText(raw.stack, MAX_STACK),
      });
    }
    case "request-failed": {
      const path = cleanPathname(raw.path);
      const status = nonNegativeInt(raw.status, 599);
      if (path === undefined || status === undefined || typeof raw.method !== "string" || !METHOD.test(raw.method)) return null;
      return { type: "request-failed", ...base, method: raw.method.toUpperCase(), path, status };
    }
    default:
      return null;
  }
}

/**
 * The valid events of a request body `{ events: [...] }`, or `null` when the body is not an object with an `events`
 * array of at most 100 items. Items that do not match a rule are left out.
 */
export function cleanBatch(raw: unknown): ClientEvent[] | null {
  if (!isRecord(raw) || !Array.isArray(raw.events) || raw.events.length > MAX_BATCH_EVENTS) return null;
  return raw.events.flatMap((item) => {
    const event = cleanEvent(item);
    return event === null ? [] : [event];
  });
}
