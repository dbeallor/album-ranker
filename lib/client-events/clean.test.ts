// @vitest-environment node
import { describe, expect, it } from "vitest";
import { cleanBatch, cleanEvent } from "./clean";

const base = { t: "2026-11-23T10:00:00.000Z", seq: 3, session: "3f0c6a52-7d1e-4b8a-9a52-0d2f6f6a1c11" };
const page = (fields: Record<string, unknown>) => ({ type: "page", ...base, path: "/library", vw: 390, ...fields });
const click = (fields: Record<string, unknown>) => ({ type: "click", ...base, tag: "button", ...fields });
const error = (fields: Record<string, unknown>) => ({ type: "error", ...base, kind: "error", message: "boom", ...fields });

type Row = { name: string; raw: unknown; expected: Record<string, unknown> | null; absent?: string[] };

function check({ raw, expected, absent = [] }: Row) {
  const result = cleanEvent(raw);
  if (expected === null) {
    expect(result).toBeNull();
    return;
  }
  expect(result).toMatchObject(expected);
  for (const key of absent) expect(result).not.toHaveProperty(key);
}

const submit = (fields: Record<string, unknown>) => ({ type: "submit", ...base, ...fields });
const failed = (fields: Record<string, unknown>) => ({ type: "request-failed", ...base, method: "POST", path: "/x", status: 500, ...fields });

describe("cleanEvent page", () => {
  it.each<Row>([
    { name: "keeps a plain path", raw: page({}), expected: { path: "/library", vw: 390 } },
    { name: "drops the query string", raw: page({ path: "/search?q=getz" }), expected: { path: "/search" } },
    { name: "drops the hash", raw: page({ path: "/import#item-4" }), expected: { path: "/import" } },
    { name: "drops query and hash together", raw: page({ path: "/a/b?x=1#y" }), expected: { path: "/a/b" } },
    { name: "turns another host into external", raw: page({ path: "https://example.com/x?y=1" }), expected: { path: "external" } },
    { name: "rounds vw", raw: page({ vw: 390.6 }), expected: { vw: 391 } },
    { name: "drops an empty path", raw: page({ path: "" }), expected: null },
    { name: "drops a numeric path", raw: page({ path: 4 }), expected: null },
    { name: "drops a missing path", raw: page({ path: undefined }), expected: null },
    { name: "drops a negative vw", raw: page({ vw: -1 }), expected: null },
    { name: "drops a string vw", raw: page({ vw: "390" }), expected: null },
    { name: "drops a NaN vw", raw: page({ vw: Number.NaN }), expected: null },
    { name: "drops an infinite vw", raw: page({ vw: Infinity }), expected: null },
  ])("$name", check);
});

describe("cleanEvent click", () => {
  it.each<Row>([
    { name: "keeps a plain href", raw: click({ href: "/library" }), expected: { href: "/library" } },
    { name: "drops the query and hash of an href", raw: click({ href: "/search?q=getz#top" }), expected: { href: "/search" } },
    { name: "turns another host into external", raw: click({ href: "https://example.com/x?y=1" }), expected: { href: "external" } },
    { name: "turns a protocol-relative url into external", raw: click({ href: "//example.com/x" }), expected: { href: "external" } },
    { name: "turns a mailto link into external", raw: click({ href: "mailto:a@b.c" }), expected: { href: "external" } },
    { name: "turns a relative string into external", raw: click({ href: "library" }), expected: { href: "external" } },
    { name: "keeps the name", raw: click({ name: "pick-a" }), expected: { name: "pick-a" } },
    { name: "trims the name", raw: click({ name: "  skip " }), expected: { name: "skip" } },
    { name: "clips the name to 100 characters", raw: click({ name: "x".repeat(150) }), expected: { name: "x".repeat(100) } },
    { name: "leaves out an empty name", raw: click({ name: "" }), expected: { tag: "button" }, absent: ["name"] },
    { name: "leaves out a blank name", raw: click({ name: "   " }), expected: { tag: "button" }, absent: ["name"] },
    { name: "leaves out a numeric name", raw: click({ name: 5 }), expected: { tag: "button" }, absent: ["name"] },
    { name: "leaves out a null name", raw: click({ name: null }), expected: { tag: "button" }, absent: ["name"] },
    { name: "lowercases the tag", raw: click({ tag: "BUTTON" }), expected: { tag: "button" } },
    { name: "drops a click with no tag", raw: click({ tag: undefined }), expected: null },
    { name: "drops a click with a tag that is not a tag name", raw: click({ tag: "<script>" }), expected: null },
  ])("$name", check);

  it("drops unknown fields and keeps only the ones for the type", () => {
    const result = cleanEvent(click({ name: "skip", value: "typed text", text: "Album One", extra: { a: 1 } }));
    expect(result).toEqual({ type: "click", ...base, tag: "button", name: "skip" });
  });
});

describe("cleanEvent submit", () => {
  it.each<Row>([
    { name: "keeps the name", raw: submit({ name: "pick-a" }), expected: { name: "pick-a" } },
    { name: "trims the name", raw: submit({ name: "  skip " }), expected: { name: "skip" } },
    { name: "clips the name to 100 characters", raw: submit({ name: "x".repeat(150) }), expected: { name: "x".repeat(100) } },
    { name: "leaves out a blank name", raw: submit({ name: "   " }), expected: { type: "submit" }, absent: ["name"] },
    { name: "leaves out a numeric name", raw: submit({ name: 5 }), expected: { type: "submit" }, absent: ["name"] },
  ])("$name", check);
});

describe("cleanEvent error", () => {
  it.each<Row>([
    { name: "accepts a rejection", raw: error({ kind: "rejection" }), expected: { kind: "rejection" } },
    { name: "drops an unknown kind", raw: error({ kind: "other" }), expected: null },
    { name: "clips the message to 300", raw: error({ message: "m".repeat(400) }), expected: { message: "m".repeat(300) } },
    { name: "clips the stack to 2000", raw: error({ stack: "s".repeat(2500) }), expected: { stack: "s".repeat(2000) } },
    { name: "removes the origin from the message", raw: error({ message: "Failed to load https://album.example.com/_next/a.js" }), expected: { message: "Failed to load /_next/a.js" } },
    { name: "removes the origin and port from the stack", raw: error({ stack: "at f (http://localhost:3000/_next/a.js:1:2)\nat g (https://x.test/b.js:3:4)" }), expected: { stack: "at f (/_next/a.js:1:2)\nat g (/b.js:3:4)" } },
    { name: "removes the query from the stack and keeps line and col", raw: error({ stack: "at https://album-ranker.com/search?q=stan%20getz:3:15" }), expected: { stack: "at /search:3:15" } },
    { name: "removes the query from the message", raw: error({ message: "Failed to load https://album-ranker.com/search?q=stan%20getz#top now" }), expected: { message: "Failed to load /search now" } },
    { name: "removes the query inside parentheses and keeps line and col", raw: error({ stack: "at f (/_next/a.js?v=2:10:5)" }), expected: { stack: "at f (/_next/a.js:10:5)" } },
    { name: "keeps a question mark that is not in a path", raw: error({ message: "What? Item #4 not found" }), expected: { message: "What? Item #4 not found" } },
    { name: "drops the query of the source", raw: error({ source: "/_next/static/a.js?v=2" }), expected: { source: "/_next/static/a.js" } },
    { name: "turns a source on another host into external", raw: error({ source: "https://cdn.example.com/a.js" }), expected: { source: "external" } },
    { name: "keeps line and col whole numbers", raw: error({ line: 12, col: 7 }), expected: { line: 12, col: 7 } },
    { name: "drops a fractional line", raw: error({ line: 1.5 }), expected: { kind: "error" }, absent: ["line"] },
    { name: "drops a negative line", raw: error({ line: -1 }), expected: { kind: "error" }, absent: ["line"] },
    { name: "drops a string line", raw: error({ line: "3" }), expected: { kind: "error" }, absent: ["line"] },
    { name: "drops a NaN col", raw: error({ col: Number.NaN }), expected: { kind: "error" }, absent: ["col"] },
  ])("$name", check);
});

describe("cleanEvent request-failed", () => {
  it.each<Row>([
    { name: "drops the hash of the path", raw: failed({ path: "/matchups#x" }), expected: { path: "/matchups" } },
    { name: "uppercases the method", raw: failed({ method: "post" }), expected: { method: "POST" } },
    { name: "accepts status 0", raw: failed({ status: 0 }), expected: { status: 0 } },
    { name: "accepts status 429", raw: failed({ status: 429 }), expected: { status: 429 } },
    { name: "drops status 600", raw: failed({ status: 600 }), expected: null },
    { name: "drops a negative status", raw: failed({ status: -1 }), expected: null },
    { name: "drops a fractional status", raw: failed({ status: 500.5 }), expected: null },
    { name: "drops a string status", raw: failed({ status: "500" }), expected: null },
    { name: "drops an empty method", raw: failed({ method: "" }), expected: null },
    { name: "drops a method with a space", raw: failed({ method: "PO ST" }), expected: null },
    { name: "drops a too long method", raw: failed({ method: "TOOLONGMETHOD" }), expected: null },
    { name: "drops a numeric method", raw: failed({ method: 4 }), expected: null },
  ])("$name", check);
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
  ])("drops $name", ({ raw }) => {
    expect(cleanEvent(raw)).toBeNull();
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
