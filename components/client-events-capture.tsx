"use client";

import { useEffect, useRef } from "react";
import { cleanEvent, MAX_BATCH_EVENTS, type ClientEvent } from "@/lib/client-events/clean";

// Front-end event capture (ALBUM-85). Does nothing unless the build set NEXT_PUBLIC_CLIENT_EVENTS=1 (build:lambda
// does), and nothing on /login. It never reads a field's value, typed text, cookies, bodies or visible text.

const ENDPOINT = "/events";
const FLUSH_MS = 15_000;
const CLICKABLE = 'a, button, [role="button"], input[type="submit"], input[type="button"]';
const SESSION_KEY = "album-events-session";
const SEQ_KEY = "album-events-seq";

/** An event before `t`, `seq` and `session`. `cleanEvent` is what checks it, so it is loosely typed here. */
type Draft = { type: ClientEvent["type"] } & Record<string, unknown>;

/** A pathname on this site, `"external"` for another host, `undefined` if it is not a url at all. */
function toPath(url: string): string | undefined {
  try {
    const parsed = new URL(url, window.location.href);
    return parsed.origin === window.location.origin ? parsed.pathname : "external";
  } catch {
    return undefined;
  }
}

/** `data-event`, else `aria-label`, else `name`, else `id`. Never the element's text or value. */
function nameOf(element: Element): string | undefined {
  for (const attribute of ["data-event", "aria-label", "name", "id"]) {
    const value = element.getAttribute(attribute);
    if (value) return value;
  }
  return undefined;
}

function sessionId(): string {
  try {
    const stored = window.sessionStorage.getItem(SESSION_KEY);
    if (stored) return stored;
    const created = window.crypto.randomUUID();
    window.sessionStorage.setItem(SESSION_KEY, created);
    return created;
  } catch {
    return window.crypto.randomUUID();
  }
}

let memorySeq = 0;
function nextSeq(): number {
  try {
    const next = Number(window.sessionStorage.getItem(SEQ_KEY) ?? "0") + 1;
    window.sessionStorage.setItem(SEQ_KEY, String(next));
    return next;
  } catch {
    return ++memorySeq;
  }
}

/** Collects events, and sends them in batches. Every public method swallows its own errors. */
function createCapture() {
  const session = sessionId();
  let buffer: ClientEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;

  function schedule(): void {
    if (timer === undefined && buffer.length > 0) timer = setTimeout(onTimer, FLUSH_MS);
  }

  function onTimer(): void {
    timer = undefined;
    flush();
    schedule();
  }

  function flush(): void {
    try {
      if (buffer.length === 0 || typeof navigator.sendBeacon !== "function") return;
      const batch = buffer.slice(0, MAX_BATCH_EVENTS);
      const body = new Blob([JSON.stringify({ events: batch })], { type: "application/json" });
      if (navigator.sendBeacon(ENDPOINT, body)) buffer = buffer.slice(batch.length);
    } catch {
      // Capture must never break a page.
    }
  }

  function record(draft: Draft): void {
    try {
      const event = cleanEvent({ ...draft, t: new Date().toISOString(), seq: nextSeq(), session });
      if (event === null) return;
      buffer.push(event);
      if (buffer.length > MAX_BATCH_EVENTS) buffer = buffer.slice(-MAX_BATCH_EVENTS);
      schedule();
    } catch {
      // Capture must never break a page.
    }
  }

  function stop(): void {
    flush();
    clearTimeout(timer);
    timer = undefined;
  }

  return { record, flush, stop };
}

type Capture = ReturnType<typeof createCapture>;

function hrefOf(element: Element): string | undefined {
  const href = element instanceof HTMLAnchorElement ? element.getAttribute("href") : null;
  return href === null ? undefined : toPath(href);
}

function describeError(reason: unknown): { message: string; stack?: string } {
  if (reason instanceof Error) return { message: reason.message, stack: reason.stack };
  return { message: typeof reason === "string" ? reason : "non-error rejection" };
}

function fetchTarget(input: RequestInfo | URL, init: RequestInit | undefined): { method: string; path: string | undefined } {
  const request = typeof Request !== "undefined" && input instanceof Request ? input : undefined;
  const url = request ? request.url : String(input);
  const parsed = new URL(url, window.location.href);
  const path = parsed.origin === window.location.origin ? parsed.pathname : undefined;
  return { method: init?.method ?? request?.method ?? "GET", path };
}

function start(capture: Capture): () => void {
  const onClick = (event: MouseEvent) => {
    try {
      const target = event.target instanceof Node ? (event.target instanceof Element ? event.target : event.target.parentElement) : null;
      const element = target?.closest(CLICKABLE);
      if (!element) return;
      capture.record({ type: "click", tag: element.tagName.toLowerCase(), href: hrefOf(element), name: nameOf(element) });
    } catch {
      // Capture must never break a page.
    }
  };
  const onSubmit = (event: Event) => {
    try {
      const form = event.target instanceof HTMLFormElement ? event.target : null;
      if (form) capture.record({ type: "submit", name: nameOf(form) });
    } catch {
      // Capture must never break a page.
    }
  };
  const onError = (event: ErrorEvent) => {
    try {
      capture.record({
        type: "error",
        kind: "error",
        message: event.message,
        source: event.filename ? toPath(event.filename) : undefined,
        line: event.lineno,
        col: event.colno,
        stack: event.error instanceof Error ? event.error.stack : undefined,
      });
    } catch {
      // Capture must never break a page.
    }
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    try {
      capture.record({ type: "error", kind: "rejection", ...describeError(event.reason) });
    } catch {
      // Capture must never break a page.
    }
  };
  const onVisibility = () => {
    if (document.visibilityState === "hidden") capture.flush();
  };
  const onPageHide = () => capture.flush();

  const originalFetch = window.fetch;
  const wrappedFetch: typeof window.fetch = async (input, init) => {
    let response: Response;
    let target: { method: string; path: string | undefined } | undefined;
    try {
      target = fetchTarget(input, init);
    } catch {
      target = undefined;
    }
    try {
      response = await originalFetch.call(window, input, init);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) report(target, 0);
      throw error;
    }
    if (response.status >= 500 || response.status === 429) report(target, response.status);
    return response;
  };
  function report(target: { method: string; path: string | undefined } | undefined, status: number): void {
    if (!target || target.path === undefined || target.path === ENDPOINT) return;
    capture.record({ type: "request-failed", method: target.method, path: target.path, status });
  }
  window.fetch = wrappedFetch;

  document.addEventListener("click", onClick, true);
  document.addEventListener("submit", onSubmit, true);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  window.addEventListener("pagehide", onPageHide);

  return () => {
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("submit", onSubmit, true);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
    window.removeEventListener("pagehide", onPageHide);
    if (window.fetch === wrappedFetch) window.fetch = originalFetch;
    capture.stop();
  };
}

export function Capturing({ pathname }: { pathname: string }) {
  const capture = useRef<Capture | null>(null);

  useEffect(() => {
    try {
      capture.current = createCapture();
      const stop = start(capture.current);
      return () => {
        stop();
        capture.current = null;
      };
    } catch {
      return undefined;
    }
  }, []);

  useEffect(() => {
    capture.current?.record({ type: "page", path: pathname, vw: window.innerWidth });
  }, [pathname]);

  return null;
}
