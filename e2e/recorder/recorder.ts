// Browser-only recorder for browser tests and `npm run record`. It must not import from the app: the
// recorder transpiles this file and injects it into each page (see inject.ts).

export type ElementInfo = {
  tag: string;
  selector: string;
  id?: string;
  name?: string;
  role?: string;
  label?: string;
  text?: string;
};

export type NavigationKind = "load" | "push" | "replace" | "pop";

export type NavigationBody = { type: "navigation"; kind: NavigationKind; url: string };
export type ClickBody = { type: "click"; x: number; y: number; target: ElementInfo };
export type InputBody = { type: "input"; value: string; target: ElementInfo };
export type SubmitBody = { type: "submit"; target: ElementInfo };
export type EventBody = NavigationBody | ClickBody | InputBody | SubmitBody;

/** What the recorder sends: the event plus the browser clock (ms since the epoch). */
export type SentEvent = EventBody & { ts: number };

/** One line of the log: `seq` and `t` are added when the log is built (see log.ts). */
export type RecordedEvent = EventBody & { seq: number; t: number };

/** Where a log came from. `host` is always known; every other field is left out when it can't be. */
export type LogSource = {
  host: string;
  kind?: "playwright" | "preview" | "dev";
  preview?: string;
  branch?: string;
  worktree?: string;
  commit?: string;
};

/** The page size after a window resize, `t` ms since `startedAt`. */
export type Resize = { t: number; width: number; height: number };

export type EventLog = {
  format: "album-ranker-events";
  version: 2;
  source: LogSource;
  /** Only for Playwright runs. */
  test?: string;
  startedAt: string;
  /** The page size in CSS pixels when the first page loaded, or `null` if it is not known. */
  viewport: { width: number; height: number } | null;
  /** Each later page size, in order. A click was measured against the last size at or before its `t`. */
  resizes: Resize[];
  events: RecordedEvent[];
};

const TEXT_MAX = 80;
const PASSWORD_MASK = "***";
const NO_TEXT_TAGS = new Set(["form", "input", "textarea", "select"]);

function clean(value: string | null | undefined): string | undefined {
  const trimmed = value?.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed : undefined;
}

function labelOf(element: Element): string | undefined {
  const aria = clean(element.getAttribute("aria-label"));
  if (aria) {
    return aria;
  }
  const labels = (element as HTMLInputElement).labels;
  if (labels && labels.length > 0) {
    return clean(labels[0].textContent);
  }
  return clean(element.closest("label")?.textContent);
}

function quote(value: string): string {
  return `"${value.replace(/["\\]/g, "\\$&")}"`;
}

function idSegment(id: string): string {
  return /^[A-Za-z_][\w-]*$/.test(id) ? `#${id}` : `[id=${quote(id)}]`;
}

function segmentOf(element: Element, withPosition: boolean): string {
  const tag = element.tagName.toLowerCase();
  if (element.id) {
    return idSegment(element.id);
  }
  let segment = tag;
  const name = element.getAttribute("name");
  if (name) {
    segment += `[name=${quote(name)}]`;
  }
  if (withPosition && element.parentElement) {
    const sameTag = Array.from(element.parentElement.children).filter((child) => child.tagName === element.tagName);
    if (sameTag.length > 1) {
      segment += `:nth-of-type(${sameTag.indexOf(element) + 1})`;
    }
  }
  return segment;
}

function pathTo(element: Element, withPosition: boolean): string {
  const segments: string[] = [];
  let current: Element | null = element;
  while (current) {
    segments.unshift(segmentOf(current, withPosition));
    const tag = current.tagName.toLowerCase();
    if (current.id || tag === "main" || tag === "body" || tag === "html") {
      break;
    }
    current = current.parentElement;
  }
  return segments.join(" > ");
}

/** Nearest id, else the name, else a child path from `main` or `body`; unique in the page. */
function selectorOf(element: Element): string {
  const simple = pathTo(element, false);
  const doc = element.ownerDocument;
  if (doc.querySelectorAll(simple).length === 1) {
    return simple;
  }
  return pathTo(element, true);
}

export function describeElement(element: Element): ElementInfo {
  const tag = element.tagName.toLowerCase();
  const info: ElementInfo = { tag, selector: selectorOf(element) };
  const id = clean(element.id);
  const name = clean(element.getAttribute("name"));
  const role = clean(element.getAttribute("role"));
  const label = labelOf(element);
  const text = NO_TEXT_TAGS.has(tag) ? undefined : clean(element.textContent)?.slice(0, TEXT_MAX);
  if (id) info.id = id;
  if (name) info.name = name;
  if (role) info.role = role;
  if (label) info.label = label;
  if (text) info.text = text;
  return info;
}

function currentUrl(): string {
  return location.pathname + location.search;
}

/**
 * Starts recording. Sends a `load` navigation for the current page straight away.
 * Returns a function that stops recording and restores `history`.
 */
export function installRecorder(send: (event: SentEvent) => void, now: () => number = Date.now): () => void {
  const emit = (body: EventBody): void => {
    try {
      send({ ...body, ts: now() });
    } catch {
      // Recording must never break the page.
    }
  };

  const onClick = (event: MouseEvent): void => {
    if (event.target instanceof Element) {
      emit({ type: "click", x: event.clientX, y: event.clientY, target: describeElement(event.target) });
    }
  };

  const onInput = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element) || !("value" in target)) {
      return;
    }
    const value = String((target as HTMLInputElement).value);
    const isPassword = target instanceof HTMLInputElement && target.type === "password";
    emit({ type: "input", value: isPassword ? PASSWORD_MASK : value, target: describeElement(target) });
  };

  const onSubmit = (event: Event): void => {
    if (event.target instanceof Element) {
      emit({ type: "submit", target: describeElement(event.target) });
    }
  };

  const onPopState = (): void => {
    emit({ type: "navigation", kind: "pop", url: currentUrl() });
  };

  const originalPush = history.pushState;
  const originalReplace = history.replaceState;

  history.pushState = function (this: History, ...args: Parameters<History["pushState"]>) {
    originalPush.apply(this, args);
    emit({ type: "navigation", kind: "push", url: currentUrl() });
  };
  history.replaceState = function (this: History, ...args: Parameters<History["replaceState"]>) {
    originalReplace.apply(this, args);
    emit({ type: "navigation", kind: "replace", url: currentUrl() });
  };

  document.addEventListener("click", onClick, true);
  document.addEventListener("input", onInput, true);
  document.addEventListener("submit", onSubmit, true);
  window.addEventListener("popstate", onPopState);

  emit({ type: "navigation", kind: "load", url: currentUrl() });

  return () => {
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("input", onInput, true);
    document.removeEventListener("submit", onSubmit, true);
    window.removeEventListener("popstate", onPopState);
    history.pushState = originalPush;
    history.replaceState = originalReplace;
  };
}
