// @vitest-environment node
import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { createAlbum } from "../db/albums";
import { memoryDb } from "../db/test-db";
import { backfillCovers, formatBackfillSummary, LOOKUP_GAP_MS, type BackfillDeps } from "./backfill-covers";
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

/** A clock that only moves when `sleep` or `advance` is called, so no test waits for real. */
function fakeClock() {
  let time = 0;
  const sleeps: number[] = [];
  return {
    now: () => time,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      time += ms;
    },
    advance: (ms: number) => {
      time += ms;
    },
    sleeps,
  };
}

function noWait(): Pick<BackfillDeps, "now" | "sleep"> {
  const { now, sleep } = fakeClock();
  return { now, sleep };
}

function run(db: DatabaseSync, fetchMock: typeof fetch, extra: Partial<BackfillDeps> = {}) {
  const lookupCover = createLookupCover({ fetch: fetchMock, log: () => {} });
  return backfillCovers(db, { lookupCover, ...noWait(), ...extra });
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

    const { missing: summary } = await run(db, fetchMock);

    expect(covers(db)).toEqual([expected]);
    expect(summary).toEqual({ total: 1, filled: counts.filled, none: counts.none, failed: 0, skipped: 0 });
  });

  it("does not look up an album that already has a cover, and keeps its URL", async () => {
    const db = memoryDb();
    add(db, 1, { cover: OLD_COVER });
    add(db, 2);
    const { fetchMock, requests } = fakeFetch({ 2: 200 });

    const { missing } = await run(db, fetchMock);

    expect(covers(db)).toEqual([OLD_COVER, CAA(2)]);
    expect(requests.some((url) => url.includes(ID(1)))).toBe(false);
    expect(missing.total).toBe(1);
  });

  it("skips an album with no catalog id without a request", async () => {
    const db = memoryDb();
    add(db, 1, { catalog: false });
    const { fetchMock } = fakeFetch({});

    const { missing: summary } = await run(db, fetchMock);

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

    const { missing: summary } = await run(db, fetchMock);

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

    await backfillCovers(db, { lookupCover, ...noWait() });

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

    const { missing } = await backfillCovers(db, { lookupCover, ...noWait() });

    expect(covers(db)).toEqual([OLD_COVER]);
    expect(missing.filled).toBe(0);
  });

  it("does not store a URL that is not an allowed cover host", async () => {
    const db = memoryDb();
    add(db, 1);

    const { missing } = await backfillCovers(db, { lookupCover: async () => ({ kind: "found", url: "https://evil.example/c.jpg" }), ...noWait() });

    expect(covers(db)).toEqual([null]);
    expect(missing.none).toBe(1);
  });

  it("reports progress every 25 albums", async () => {
    const db = memoryDb();
    for (let n = 1; n <= 51; n++) add(db, n, { catalog: false });
    const onProgress = vi.fn();

    await backfillCovers(db, { lookupCover: async () => ({ kind: "none" }), onProgress, ...noWait() });

    expect(onProgress.mock.calls).toEqual([[25, 51], [50, 51]]);
  });

  it("fills missing covers the same when run twice as when run once, and the second run only asks about albums still at null", async () => {
    const db = memoryDb();
    add(db, 1, { cover: OLD_COVER });
    add(db, 2); // CAA cover
    add(db, 3); // no match
    add(db, 4); // CAA fails the first time
    add(db, 5, { catalog: false });
    const first = fakeFetch({ 2: 200, 4: 500 });

    const { missing: firstSummary } = await run(db, first.fetchMock);
    const afterOne = covers(db);

    expect(firstSummary).toEqual({ total: 4, filled: 1, none: 1, failed: 1, skipped: 1 });
    expect(afterOne).toEqual([OLD_COVER, CAA(2), null, null, null]);

    const second = fakeFetch({ 4: 200 });
    const { missing: secondSummary } = await run(db, second.fetchMock);

    // Albums 3 and 4 are still at null; album 2's new CAA link is only checked by the link pass, after the missing pass.
    expect(second.caaRequests().map((url) => url.match(/-(\d{12})\//)![1])).toEqual(["000000000003", "000000000004", "000000000002"]);
    expect(covers(db)).toEqual([OLD_COVER, CAA(2), null, CAA(4), null]);
    expect(secondSummary).toEqual({ total: 3, filled: 1, none: 1, failed: 0, skipped: 1 });

    const third = fakeFetch({ 4: 200 });
    await run(db, third.fetchMock);
    expect(covers(db)).toEqual([OLD_COVER, CAA(2), null, CAA(4), null]);
  });
});

/** Pulls the album number out of a CAA or Deezer request, to see which albums were asked about. */
const askedAbout = (urls: string[]) => urls.map((url) => Number(url.match(/-(\d{12})\//)?.[1] ?? new URL(url).searchParams.get("q")!.match(/album:"Album (\d+)"$/)![1]));

const noArtwork = (n: number) => json({ data: [{ title: `Album ${n}`, cover_medium: "https://cdn-images.dzcdn.net/images/cover//250x250-000000-80-0-0.jpg", md5_image: "", artist: { name: `Artist ${n}` } }] });

describe("backfillCovers link pass", () => {
  it.each<{ name: string; caa: CaaReplies; deezer: DeezerReplies; expected: string; counts: Partial<Record<"kept" | "replaced" | "stillDead" | "failed", number>> }>([
    { name: "CAA 307 is kept", caa: { 1: 307 }, deezer: {}, expected: CAA(1), counts: { kept: 1 } },
    { name: "CAA 404 and a Deezer match is replaced", caa: {}, deezer: { 1: deezerMatch(1) }, expected: DEEZER_COVER, counts: { replaced: 1 } },
    { name: "CAA 404 and no Deezer match is still dead", caa: {}, deezer: {}, expected: CAA(1), counts: { stillDead: 1 } },
    { name: "CAA 404 and Deezer's no-artwork image is still dead", caa: {}, deezer: { 1: noArtwork(1) }, expected: CAA(1), counts: { stillDead: 1 } },
    { name: "CAA 500 fails", caa: { 1: 500 }, deezer: {}, expected: CAA(1), counts: { failed: 1 } },
    { name: "a CAA network error fails", caa: { 1: new TypeError("fetch failed") }, deezer: {}, expected: CAA(1), counts: { failed: 1 } },
    { name: "CAA 404 and Deezer 500 fails", caa: {}, deezer: { 1: new Response("oops", { status: 500 }) }, expected: CAA(1), counts: { failed: 1 } },
  ])("$name", async ({ caa, deezer, expected, counts }) => {
    const db = memoryDb();
    add(db, 1, { cover: CAA(1) });
    const { fetchMock } = fakeFetch(caa, deezer);

    const { links } = await run(db, fetchMock);

    expect(covers(db)).toEqual([expected]);
    expect(links).toEqual({ checked: 1, kept: 0, replaced: 0, stillDead: 0, failed: 0, skipped: 0, ...counts });
  });

  it.each<{ name: string; catalog: boolean; cover: string; skipped: number }>([
    { name: "an album with no catalog id is skipped", catalog: false, cover: CAA(1), skipped: 1 },
    { name: "a CAA link for another id is skipped", catalog: true, cover: CAA(9), skipped: 1 },
    { name: "a Deezer CDN cover is not selected", catalog: true, cover: DEEZER_COVER, skipped: 0 },
    { name: "a host that only starts with coverartarchive.org is not selected", catalog: true, cover: `https://coverartarchive.org.evil.example/release-group/${ID(1)}/front-250`, skipped: 0 },
  ])("$name, and nothing is requested", async ({ catalog, cover, skipped }) => {
    const db = memoryDb();
    add(db, 1, { catalog, cover });
    const { fetchMock } = fakeFetch({});

    const { links } = await run(db, fetchMock);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(covers(db)).toEqual([cover]);
    expect(links).toEqual({ checked: 0, kept: 0, replaced: 0, stillDead: 0, failed: 0, skipped });
  });

  it("does not overwrite a cover changed between the lookup and the update", async () => {
    const db = memoryDb();
    const id = add(db, 1, { cover: CAA(1) });
    const changed = "https://cdn-images.dzcdn.net/images/cover/other/250x250-000000-80-0-0.jpg";
    const lookupCover = async (): Promise<CoverLookup> => {
      db.prepare("UPDATE albums SET cover_url = ? WHERE id = ?").run(changed, id);
      return { kind: "found", url: DEEZER_COVER };
    };

    const { links } = await backfillCovers(db, { lookupCover, ...noWait() });

    expect(covers(db)).toEqual([changed]);
    expect(links).toMatchObject({ replaced: 0, kept: 1 });
  });

  it("does not store a replacement that is not an allowed cover host", async () => {
    const db = memoryDb();
    add(db, 1, { cover: CAA(1) });

    const { links } = await backfillCovers(db, { lookupCover: async () => ({ kind: "found", url: "https://evil.example/c.jpg" }), ...noWait() });

    expect(covers(db)).toEqual([CAA(1)]);
    expect(links).toMatchObject({ replaced: 0, stillDead: 1 });
  });

  it("does not check again a cover the missing pass just filled", async () => {
    const db = memoryDb();
    add(db, 1);
    const { fetchMock, caaRequests } = fakeFetch({ 1: 200 });

    const { missing, links } = await run(db, fetchMock);

    expect(caaRequests()).toHaveLength(1);
    expect(covers(db)).toEqual([CAA(1)]);
    expect(missing.filled).toBe(1);
    expect(links.checked).toBe(0);
  });

  it.each<{ name: string; lookupMs: number; sleeps: number[]; starts: number[] }>([
    { name: "instant lookups wait the whole gap", lookupMs: 0, sleeps: [LOOKUP_GAP_MS, LOOKUP_GAP_MS], starts: [0, 1000, 2000] },
    { name: "a lookup that took 300 ms waits the rest of the gap", lookupMs: 300, sleeps: [700, 700], starts: [0, 1000, 2000] },
    { name: "a lookup slower than the gap does not wait", lookupMs: 1500, sleeps: [], starts: [0, 1500, 3000] },
  ])("$name, across both passes, and skipped albums add no wait", async ({ lookupMs, sleeps, starts }) => {
    const db = memoryDb();
    add(db, 1); // missing pass
    add(db, 2, { cover: CAA(2) }); // link pass
    add(db, 3, { catalog: false, cover: CAA(3) }); // skipped: no wait
    add(db, 4, { cover: CAA(4) }); // link pass
    const clock = fakeClock();
    const startTimes: number[] = [];
    const lookupCover = async (): Promise<CoverLookup> => {
      startTimes.push(clock.now());
      clock.advance(lookupMs);
      return { kind: "none" };
    };

    await backfillCovers(db, { lookupCover, now: clock.now, sleep: clock.sleep });

    expect(startTimes).toEqual(starts);
    expect(clock.sleeps).toEqual(sleeps);
  });

  it("gives the same database when run twice as when run once, and does not ask Deezer about a replaced album again", async () => {
    const answers = () => fakeFetch({ 2: 200, 4: 500 }, { 1: deezerMatch(1), 5: deezerMatch(5) });
    const seed = () => {
      const db = memoryDb();
      add(db, 1, { cover: CAA(1) }); // dead, Deezer match: replaced
      add(db, 2, { cover: CAA(2) }); // works: kept
      add(db, 3, { cover: CAA(3) }); // dead, no match: still dead
      add(db, 4, { cover: CAA(4) }); // CAA fails: failed
      add(db, 5, { cover: CAA(5) }); // dead, Deezer match: replaced
      return db;
    };
    const once = seed();
    const twice = seed();

    const first = answers();
    const { links: firstLinks } = await run(once, first.fetchMock);
    await run(twice, answers().fetchMock);
    const second = answers();
    const { links: secondLinks } = await run(twice, second.fetchMock);

    expect(firstLinks).toEqual({ checked: 5, kept: 1, replaced: 2, stillDead: 1, failed: 1, skipped: 0 });
    expect(covers(once)).toEqual([DEEZER_COVER, CAA(2), CAA(3), CAA(4), DEEZER_COVER]);
    expect(covers(twice)).toEqual(covers(once));
    expect(secondLinks).toEqual({ checked: 3, kept: 1, replaced: 0, stillDead: 1, failed: 1, skipped: 0 });
    expect(askedAbout(second.requests)).toEqual([2, 3, 3, 4]);
  });

  it("reports progress every 25 albums in each pass", async () => {
    const db = memoryDb();
    for (let n = 1; n <= 25; n++) add(db, n, { catalog: false });
    for (let n = 26; n <= 75; n++) add(db, n, { cover: CAA(n) });
    const onProgress = vi.fn();

    await backfillCovers(db, { lookupCover: async () => ({ kind: "none" }), onProgress, ...noWait() });

    expect(onProgress.mock.calls).toEqual([[25, 25], [25, 50], [50, 50]]);
  });
});

describe("formatBackfillSummary", () => {
  it("prints the missing-cover and the link summaries", () => {
    const text = formatBackfillSummary({
      missing: { total: 3, filled: 1, none: 1, failed: 1, skipped: 0 },
      links: { checked: 678, kept: 590, replaced: 61, stillDead: 22, failed: 5, skipped: 0 },
    });

    expect(text).toBe(
      [
        "Missing covers",
        "Filled:       1",
        "Still none:   1   (no cover on CAA or a matching one on Deezer)",
        "Failed:       1   (a lookup failed; run again to retry)",
        "Skipped:      0   (no catalog id)",
        "",
        "Cover Art Archive links",
        "Checked:    678",
        "Kept:       590   (the link works)",
        "Replaced:    61   (dead link, now the Deezer cover)",
        "Still dead:  22   (dead link, no matching cover on Deezer; left as it is)",
        "Failed:       5   (a check failed; run again to retry)",
        "Skipped:      0   (no catalog id, or not this album's own CAA link)",
      ].join("\n"),
    );
  });
});
