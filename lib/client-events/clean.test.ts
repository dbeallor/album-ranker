// @vitest-environment node
import { describe, expect, it } from "vitest";
import { cleanBatch, cleanEvent } from "./clean";

const base = { t: "2026-11-23T10:00:00.000Z", seq: 3, session: "3f0c6a52-7d1e-4b8a-9a52-0d2f6f6a1c11" };
const page = (fields: Record<string, unknown>) => ({ type: "page", ...base, path: "/library", vw: 390, ...fields });
const click = (fields: Record<string, unknown>) => ({ type: "click", ...base, tag: "button", ...fields });
const error = (fields: Record<string, unknown>) => ({ type: "error", ...base, kind: "error", message: "boom", ...fields });

describe("cleanEvent paths", () => {
  it.each([
    { name: "keeps a plain path", input: "/library", expected: "/library" },
    { name: "drops the query string", input: "/search?q=getz", expected: "/search" },
    { name: "drops the hash", input: "/import#item-4", expected: "/import" },
    { name: "drops query and hash together", input: "/a/b?x=1#y", expected: "/a/b" },
    { name: "turns another host into external", input: "https://example.com/x?y=1", expected: "external" },
    { name: "turns a protocol-relative url into external", input: "//example.com/x", expected: "external" },
    { name: "turns a mailto link into external", input: "mailto:a@b.c", expected: "external" },
    { name: "turns a relative string into external", input: "library", expected: "external" },
  ])("href: $name", ({ input, expected }) => {
    expect(cleanEvent(click({ href: input }))).toMatchObject({ href: expected });
  });

  it.each([
    { name: "page path drops the query", event: page({ path: "/search?q=getz" }), expected: { path: "/search" } },
    { name: "request path drops the hash", event: { type: "request-failed", ...base, method: "POST", path: "/matchups#x", status: 500 }, expected: { path: "/matchups" } },
    { name: "error source drops the query", event: error({ source: "/_next/static/a.js?v=2" }), expected: { source: "/_next/static/a.js" } },
    { name: "error source from another host", event: error({ source: "https://cdn.example.com/a.js" }), expected: { source: "external" } },
  ])("$name", ({ event, expected }) => {
    expect(cleanEvent(event)).toMatchObject(expected);
  });

  it.each([{ path: "" }, { path: 4 }, { path: undefined }])("drops a page event whose path is $path", (fields) => {
    expect(cleanEvent(page(fields))).toBeNull();
  });
});

describe("cleanEvent names", () => {
  it.each([
    { name: "keeps the name", input: "pick-a", expected: "pick-a" },
    { name: "trims it", input: "  skip ", expected: "skip" },
    { name: "clips it to 100 characters", input: "x".repeat(150), expected: "x".repeat(100) },
  ])("$name", ({ input, expected }) => {
    expect(cleanEvent(click({ name: input }))).toMatchObject({ name: expected });
    expect(cleanEvent({ type: "submit", ...base, name: input })).toMatchObject({ name: expected });
  });

  it.each([{ value: "" }, { value: "   " }, { value: 5 }, { value: null }, { value: undefined }])("leaves out a name of $value", ({ value }) => {
    expect(cleanEvent(click({ name: value }))).not.toHaveProperty("name");
  });
});

describe("cleanEvent errors", () => {
  it.each([
    { name: "clips the message to 300", fields: { message: "m".repeat(400) }, expected: { message: "m".repeat(300) } },
    { name: "clips the stack to 2000", fields: { stack: "s".repeat(2500) }, expected: { stack: "s".repeat(2000) } },
    { name: "removes the origin from the message", fields: { message: "Failed to load https://album.example.com/_next/a.js" }, expected: { message: "Failed to load /_next/a.js" } },
    { name: "removes the origin and port from the stack", fields: { stack: "at f (http://localhost:3000/_next/a.js:1:2)\nat g (https://x.test/b.js:3:4)" }, expected: { stack: "at f (/_next/a.js:1:2)\nat g (/b.js:3:4)" } },
    { name: "keeps line and col whole numbers", fields: { line: 12, col: 7 }, expected: { line: 12, col: 7 } },
    { name: "accepts a rejection", fields: { kind: "rejection" }, expected: { kind: "rejection" } },
  ])("$name", ({ fields, expected }) => {
    expect(cleanEvent(error(fields))).toMatchObject(expected);
  });

  it.each([{ line: 1.5 }, { line: -1 }, { line: "3" }, { col: Number.NaN }])("drops a bad line or col %o", (fields) => {
    const result = cleanEvent(error(fields));
    expect(result).not.toHaveProperty("line");
    expect(result).not.toHaveProperty("col");
  });

  it("drops an error with an unknown kind", () => {
    expect(cleanEvent(error({ kind: "other" }))).toBeNull();
  });
});

describe("cleanEvent numbers", () => {
  it.each([
    { vw: 390, expected: 390 },
    { vw: 390.6, expected: 391 },
    { vw: 1024.2, expected: 1024 },
  ])("rounds vw $vw to a whole number", ({ vw, expected }) => {
    expect(cleanEvent(page({ vw }))).toMatchObject({ vw: expected });
  });

  it.each([{ vw: -1 }, { vw: "390" }, { vw: Number.NaN }, { vw: Infinity }])("drops a page event whose vw is $vw", ({ vw }) => {
    expect(cleanEvent(page({ vw }))).toBeNull();
  });

  it.each([
    { status: 0, valid: true },
    { status: 429, valid: true },
    { status: 503, valid: true },
    { status: 600, valid: false },
    { status: -1, valid: false },
    { status: 500.5, valid: false },
    { status: "500", valid: false },
  ])("request status $status is valid: $valid", ({ status, valid }) => {
    const result = cleanEvent({ type: "request-failed", ...base, method: "post", path: "/x", status });
    expect(result !== null).toBe(valid);
    if (valid) expect(result).toMatchObject({ method: "POST", status });
  });

  it.each([{ method: "" }, { method: "PO ST" }, { method: "TOOLONGMETHOD" }, { method: 4 }])("drops a request with method $method", ({ method }) => {
    expect(cleanEvent({ type: "request-failed", ...base, method, path: "/x", status: 500 })).toBeNull();
  });
});

describe("cleanEvent shape", () => {
  it.each([
    { name: "an unknown type", raw: { ...base, type: "keypress", key: "a" } },
    { name: "no type", raw: { ...base } },
    { name: "a string", raw: "click" },
    { name: "null", raw: null },
    { name: "an array", raw: [] },
    { name: "a bad time", raw: page({ t: "yesterday" }) },
    { name: "a missing seq", raw: page({ seq: undefined }) },
    { name: "a fractional seq", raw: page({ seq: 1.5 }) },
    { name: "a bad session id", raw: page({ session: "has spaces!" }) },
    { name: "a click with no tag", raw: click({ tag: undefined }) },
    { name: "a click with a tag that is not a tag name", raw: click({ tag: "<script>" }) },
  ])("drops $name", ({ raw }) => {
    expect(cleanEvent(raw)).toBeNull();
  });

  it("drops unknown fields and keeps only the ones for the type", () => {
    const result = cleanEvent(click({ name: "skip", value: "typed text", text: "Album One", extra: { a: 1 } }));
    expect(result).toEqual({ type: "click", ...base, tag: "button", name: "skip" });
  });

  it("lowercases the tag", () => {
    expect(cleanEvent(click({ tag: "BUTTON" }))).toMatchObject({ tag: "button" });
  });

  it("normalizes the time to ISO", () => {
    expect(cleanEvent(page({ t: "2026-11-23T10:00:00Z" }))).toMatchObject({ t: "2026-11-23T10:00:00.000Z" });
  });
});

describe("cleanBatch", () => {
  it("keeps the valid events and drops the rest", () => {
    const result = cleanBatch({ events: [page({}), { type: "keypress", ...base }, click({ name: "skip" }), "junk"] });
    expect(result?.map((event) => event.type)).toEqual(["page", "click"]);
  });

  it.each([
    { name: "not an object", raw: "x" },
    { name: "null", raw: null },
    { name: "no events", raw: {} },
    { name: "events that is not an array", raw: { events: "x" } },
    { name: "101 events", raw: { events: Array.from({ length: 101 }, () => page({})) } },
  ])("returns null for $name", ({ raw }) => {
    expect(cleanBatch(raw)).toBeNull();
  });

  it("accepts exactly 100 events and an empty list", () => {
    expect(cleanBatch({ events: Array.from({ length: 100 }, () => page({})) })).toHaveLength(100);
    expect(cleanBatch({ events: [] })).toEqual([]);
  });
});
