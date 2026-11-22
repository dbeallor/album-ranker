// @vitest-environment node
import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { createAlbum } from "../db/albums";
import { memoryDb } from "../db/test-db";
import { backfillCovers, type BackfillDeps } from "./backfill-covers";
import { createLookupCover, type CoverLookup } from "./cover-art";

const ID = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const CAA = (n: number) => `https://coverartarchive.org/release-group/${ID(n)}/front-250`;
const DEEZER_COVER = "https://cdn-images.dzcdn.net/images/cover/abc/250x250-000000-80-0-0.jpg";
const OLD_COVER = "https://coverartarchive.org/release-group/old/front-250";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Replies by album: `caa[n]` is the status the CAA HEAD gets (404 when absent), `deezer[n]` the Deezer answer (no match when absent). */
type CaaReplies = Record<number, number | Error>;
type DeezerReplies = Record<number, Response | Error>;

function fakeFetch(caa: CaaReplies, deezer: DeezerReplies = {}) {
  const requests: string[] = [];
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    requests.push(url);
    if (url.startsWith("https://coverartarchive.org/")) {
      const n = Number(url.match(/-(\d{12})\//)![1]);
      const reply = caa[n] ?? 404;
      if (reply instanceof Error) throw reply;
      return new Response(null, { status: reply });
    }
    const title = new URL(url).searchParams.get("q")!.match(/album:"(.*)"$/)![1];
    const reply = deezer[Number(title.replace("Album ", ""))] ?? json({ data: [] });
    if (reply instanceof Error) throw reply;
    return reply;
  });
  return { fetchMock, requests, caaRequests: () => requests.filter((url) => url.startsWith("https://coverartarchive.org/")) };
}

const deezerMatch = (n: number) => json({ data: [{ title: `Album ${n}`, cover_medium: DEEZER_COVER, md5_image: "abc", artist: { name: `Artist ${n}` } }] });

function add(db: DatabaseSync, n: number, { catalog = true, cover = null }: { catalog?: boolean; cover?: string | null } = {}) {
  return createAlbum(db, { title: `Album ${n}`, artist: { name: `Artist ${n}` }, catalogId: catalog ? ID(n) : null, coverUrl: cover }).id;
}

function covers(db: DatabaseSync): (string | null)[] {
  return db.prepare("SELECT cover_url FROM albums ORDER BY id").all().map((row) => row.cover_url as string | null);
}

function run(db: DatabaseSync, fetchMock: typeof fetch, extra: Partial<BackfillDeps> = {}) {
  const lookupCover = createLookupCover({ fetch: fetchMock, log: () => {} });
  return backfillCovers(db, { lookupCover, ...extra });
}

describe("backfillCovers", () => {
  it.each<{ name: string; caa: CaaReplies; deezer: DeezerReplies; expected: string | null; counts: { filled: number; none: number } }>([
    { name: "a CAA cover", caa: { 1: 307 }, deezer: {}, expected: CAA(1), counts: { filled: 1, none: 0 } },
    { name: "a Deezer match when CAA has none", caa: {}, deezer: { 1: deezerMatch(1) }, expected: DEEZER_COVER, counts: { filled: 1, none: 0 } },
    { name: "no match on CAA or Deezer", caa: {}, deezer: {}, expected: null, counts: { filled: 0, none: 1 } },
  ])("an album with no cover and $name ends up as $expected", async ({ caa, deezer, expected, counts }) => {
    const db = memoryDb();
    add(db, 1);
    const { fetchMock } = fakeFetch(caa, deezer);

    const summary = await run(db, fetchMock);

    expect(covers(db)).toEqual([expected]);
    expect(summary).toEqual({ total: 1, filled: counts.filled, none: counts.none, failed: 0, skipped: 0 });
  });

  it("does not look up an album that already has a cover, and keeps its URL", async () => {
    const db = memoryDb();
    add(db, 1, { cover: OLD_COVER });
    add(db, 2);
    const { fetchMock, requests } = fakeFetch({ 2: 200 });

    const summary = await run(db, fetchMock);

    expect(covers(db)).toEqual([OLD_COVER, CAA(2)]);
    expect(requests.some((url) => url.includes(ID(1)))).toBe(false);
    expect(summary.total).toBe(1);
  });

  it("skips an album with no catalog id without a request", async () => {
    const db = memoryDb();
    add(db, 1, { catalog: false });
    const { fetchMock } = fakeFetch({});

    const summary = await run(db, fetchMock);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(covers(db)).toEqual([null]);
    expect(summary).toEqual({ total: 1, filled: 0, none: 0, failed: 0, skipped: 1 });
  });

  it.each<{ name: string; caa: CaaReplies; deezer: DeezerReplies }>([
    { name: "a CAA 500", caa: { 1: 500 }, deezer: {} },
    { name: "a CAA network error", caa: { 1: new TypeError("fetch failed") }, deezer: {} },
    { name: "a Deezer 500", caa: {}, deezer: { 1: new Response("oops", { status: 500 }) } },
    { name: "a Deezer network error", caa: {}, deezer: { 1: new TypeError("fetch failed") } },
    { name: "a Deezer body that is not JSON", caa: {}, deezer: { 1: new Response("<html>") } },
  ])("counts $name as failed and leaves the cover null", async ({ caa, deezer }) => {
    const db = memoryDb();
    add(db, 1);
    const { fetchMock } = fakeFetch(caa, deezer);

    const summary = await run(db, fetchMock);

    expect(covers(db)).toEqual([null]);
    expect(summary).toEqual({ total: 1, filled: 0, none: 0, failed: 1, skipped: 0 });
  });

  it("looks albums up one at a time, in id order", async () => {
    const db = memoryDb();
    for (const n of [1, 2, 3]) add(db, n);
    let running = 0;
    let peak = 0;
    const order: string[] = [];
    const lookupCover = async (query: { catalogId: string }): Promise<CoverLookup> => {
      peak = Math.max(peak, ++running);
      order.push(query.catalogId);
      await new Promise((resolve) => setTimeout(resolve, 1));
      running--;
      return { kind: "none" };
    };

    await backfillCovers(db, { lookupCover });

    expect(peak).toBe(1);
    expect(order).toEqual([ID(1), ID(2), ID(3)]);
  });

  it("does not overwrite a cover stored between the lookup and the update", async () => {
    const db = memoryDb();
    const id = add(db, 1);
    const lookupCover = async (): Promise<CoverLookup> => {
      db.prepare("UPDATE albums SET cover_url = ? WHERE id = ?").run(OLD_COVER, id);
      return { kind: "found", url: CAA(1) };
    };

    const summary = await backfillCovers(db, { lookupCover });

    expect(covers(db)).toEqual([OLD_COVER]);
    expect(summary.filled).toBe(0);
  });

  it("does not store a URL that is not an allowed cover host", async () => {
    const db = memoryDb();
    add(db, 1);

    const summary = await backfillCovers(db, { lookupCover: async () => ({ kind: "found", url: "https://evil.example/c.jpg" }) });

    expect(covers(db)).toEqual([null]);
    expect(summary.none).toBe(1);
  });

  it("reports progress every 25 albums", async () => {
    const db = memoryDb();
    for (let n = 1; n <= 51; n++) add(db, n, { catalog: false });
    const onProgress = vi.fn();

    await backfillCovers(db, { lookupCover: async () => ({ kind: "none" }), onProgress });

    expect(onProgress.mock.calls).toEqual([[25, 51], [50, 51]]);
  });

  it("gives the same database when run twice as when run once, and the second run only asks about albums still at null", async () => {
    const db = memoryDb();
    add(db, 1, { cover: OLD_COVER });
    add(db, 2); // CAA cover
    add(db, 3); // no match
    add(db, 4); // CAA fails the first time
    add(db, 5, { catalog: false });
    const first = fakeFetch({ 2: 200, 4: 500 });

    const firstSummary = await run(db, first.fetchMock);
    const afterOne = covers(db);

    expect(firstSummary).toEqual({ total: 4, filled: 1, none: 1, failed: 1, skipped: 1 });
    expect(afterOne).toEqual([OLD_COVER, CAA(2), null, null, null]);

    const second = fakeFetch({ 4: 200 });
    const secondSummary = await run(db, second.fetchMock);

    expect(second.caaRequests().map((url) => url.match(/-(\d{12})\//)![1])).toEqual(["000000000003", "000000000004"]);
    expect(covers(db)).toEqual([OLD_COVER, CAA(2), null, CAA(4), null]);
    expect(secondSummary).toEqual({ total: 3, filled: 1, none: 1, failed: 0, skipped: 1 });

    const third = fakeFetch({ 4: 200 });
    await run(db, third.fetchMock);
    expect(covers(db)).toEqual([OLD_COVER, CAA(2), null, CAA(4), null]);
  });
});
