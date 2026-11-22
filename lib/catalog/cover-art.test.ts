// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLookupCover, createResolveCover, isAllowedCoverUrl, normalizeForMatch } from "./cover-art";

const CATALOG_ID = "11111111-2222-3333-4444-555555555555";
const CAA = `https://coverartarchive.org/release-group/${CATALOG_ID}/front-250`;
const DEEZER_COVER = "https://cdn-images.dzcdn.net/images/cover/abc/250x250-000000-80-0-0.jpg";
const ALBUM = { catalogId: CATALOG_ID, title: "Kind of Blue", artist: "Miles Davis" };

type Reply = Response | Error;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function deezerAlbum(title: string, artist: string, cover: unknown = DEEZER_COVER, md5Image: unknown = "abc") {
  return { title, cover_medium: cover, md5_image: md5Image, artist: { name: artist } };
}

/** A fake fetch: `caa` answers the Cover Art Archive HEAD, `deezer` answers the Deezer search. */
function setup(
  caa: Reply | (() => Reply),
  deezer: Reply | (() => Reply) = () => json({ data: [] }),
  bases: { caaUrl?: () => string; deezerUrl?: () => string } = {},
) {
  const caaBase = bases.caaUrl?.() ?? "https://coverartarchive.org";
  const deezerBase = bases.deezerUrl?.() ?? "https://api.deezer.com";
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    const reply = url.startsWith(`${caaBase}/`) ? caa : deezer;
    const result = typeof reply === "function" ? reply() : reply;
    if (result instanceof Error) throw result;
    return result;
  });
  const log = vi.fn();
  const deps = { fetch: fetchMock, userAgent: () => "album-ranker-test/1", log, ...bases };
  const resolveCover = createResolveCover(deps);
  const lookupCover = createLookupCover(deps);
  const calls = (host: string) => fetchMock.mock.calls.filter(([input]) => String(input).startsWith(host));
  return { resolveCover, lookupCover, fetchMock, log, caaCalls: () => calls(`${caaBase}/`), deezerCalls: () => calls(`${deezerBase}/`) };
}

const noCover = () => new Response(null, { status: 404 });

describe("the Cover Art Archive check", () => {
  it.each([
    { name: "a 307 redirect to the image", reply: new Response(null, { status: 307 }) },
    { name: "a 200", reply: new Response(null, { status: 200 }) },
  ])("keeps the CAA URL on $name and never asks Deezer", async ({ reply }) => {
    const { resolveCover, caaCalls, deezerCalls } = setup(reply);

    expect(await resolveCover(ALBUM)).toBe(CAA);
    expect(caaCalls()).toHaveLength(1);
    expect(deezerCalls()).toHaveLength(0);
  });

  it("sends a HEAD that does not follow redirects, with a timeout and the user agent", async () => {
    const { resolveCover, caaCalls } = setup(new Response(null, { status: 307 }));
    await resolveCover(ALBUM);

    const [url, init] = caaCalls()[0];
    expect(url).toBe(CAA);
    expect(init).toMatchObject({ method: "HEAD", redirect: "manual", headers: { "User-Agent": "album-ranker-test/1" } });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    { name: "a 500", reply: new Response(null, { status: 500 }) },
    { name: "a 503", reply: new Response(null, { status: 503 }) },
    { name: "a network error", reply: new TypeError("fetch failed") },
    { name: "a timeout", reply: new DOMException("timed out", "TimeoutError") },
  ])("keeps the CAA URL on $name, because it can't tell, and never asks Deezer", async ({ reply }) => {
    const { resolveCover, deezerCalls, log } = setup(reply);

    expect(await resolveCover(ALBUM)).toBe(CAA);
    expect(deezerCalls()).toHaveLength(0);
    expect(log).toHaveBeenCalled();
  });
});

describe("lookupCover", () => {
  const deezerMatch = json({ data: [deezerAlbum("Kind of Blue", "Miles Davis")] });

  it.each([
    { name: "a CAA 200", caa: new Response(null, { status: 200 }), deezer: undefined, expected: { kind: "found", url: CAA } },
    { name: "a CAA 307", caa: new Response(null, { status: 307 }), deezer: undefined, expected: { kind: "found", url: CAA } },
    { name: "a CAA 404 and a Deezer match", caa: noCover(), deezer: deezerMatch, expected: { kind: "found", url: DEEZER_COVER } },
    { name: "a CAA 404 and no Deezer match", caa: noCover(), deezer: json({ data: [] }), expected: { kind: "none" } },
    { name: "a CAA 404 and Deezer's stock no-artwork cover", caa: noCover(), deezer: json({ data: [deezerAlbum("Kind of Blue", "Miles Davis", DEEZER_COVER, "")] }), expected: { kind: "none" } },
    { name: "a CAA 500", caa: new Response(null, { status: 500 }), deezer: undefined, expected: { kind: "failed" } },
    { name: "a CAA network error", caa: new TypeError("fetch failed"), deezer: undefined, expected: { kind: "failed" } },
    { name: "a CAA timeout", caa: new DOMException("timed out", "TimeoutError"), deezer: undefined, expected: { kind: "failed" } },
    { name: "a CAA 404 and a Deezer 500", caa: noCover(), deezer: new Response("oops", { status: 500 }), expected: { kind: "failed" } },
    { name: "a CAA 404 and a Deezer network error", caa: noCover(), deezer: new TypeError("fetch failed"), expected: { kind: "failed" } },
    { name: "a CAA 404 and a Deezer body that is not JSON", caa: noCover(), deezer: new Response("<html>", { status: 200 }), expected: { kind: "failed" } },
  ])("gives $expected.kind for $name", async ({ caa, deezer, expected }) => {
    const { lookupCover } = setup(caa, deezer);

    expect(await lookupCover(ALBUM)).toEqual(expected);
  });

  it("does not ask Deezer after a CAA failure", async () => {
    const { lookupCover, deezerCalls } = setup(new Response(null, { status: 500 }));
    await lookupCover(ALBUM);

    expect(deezerCalls()).toHaveLength(0);
  });

  it("gives none without a request for a catalog id that is not a UUID", async () => {
    const { lookupCover, fetchMock } = setup(noCover);

    expect(await lookupCover({ ...ALBUM, catalogId: "../../etc/passwd" })).toEqual({ kind: "none" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("a configured lookup base", () => {
  const STUB = "http://127.0.0.1:1";

  it.each([
    { name: "a 200", reply: new Response(null, { status: 200 }) },
    { name: "a network error", reply: new TypeError("fetch failed") },
  ])("checks the base but returns the canonical CAA URL on $name", async ({ reply }) => {
    const { resolveCover, caaCalls } = setup(reply, undefined, { caaUrl: () => STUB });

    expect(await resolveCover(ALBUM)).toBe(CAA);
    expect(caaCalls().map(([input]) => String(input))).toEqual([`${STUB}/release-group/${CATALOG_ID}/front-250`]);
  });

  it("sends the Deezer search to the configured base", async () => {
    const { resolveCover, deezerCalls } = setup(noCover, json({ data: [deezerAlbum("Kind of Blue", "Miles Davis")] }), {
      deezerUrl: () => STUB,
    });

    expect(await resolveCover(ALBUM)).toBe(DEEZER_COVER);
    expect(String(deezerCalls()[0][0]).startsWith(`${STUB}/search/album?`)).toBe(true);
  });
});

describe("input the browser could have forged", () => {
  it.each([
    { name: "a catalog id with path characters", query: { ...ALBUM, catalogId: "../../etc/passwd" } },
    { name: "an empty catalog id", query: { ...ALBUM, catalogId: "" } },
    { name: "a title over 300 characters", query: { ...ALBUM, title: "t".repeat(301) } },
    { name: "an artist over 300 characters", query: { ...ALBUM, artist: "a".repeat(301) } },
  ])("makes no request for $name", async ({ query }) => {
    const { resolveCover, fetchMock } = setup(noCover);

    expect(await resolveCover(query)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lower-cases the catalog id in the CAA URL", async () => {
    const { resolveCover } = setup(new Response(null, { status: 307 }));

    const upper = "ABCDEF12-2222-3333-4444-555555555555";
    expect(await resolveCover({ ...ALBUM, catalogId: upper })).toBe(`https://coverartarchive.org/release-group/${upper.toLowerCase()}/front-250`);
  });
});

describe("the Deezer fallback", () => {
  it("takes the cover of a close match when CAA answers 404", async () => {
    const { resolveCover, deezerCalls } = setup(noCover, json({ data: [deezerAlbum("Kind of Blue (Legacy Edition)", "Miles Davis")] }));

    expect(await resolveCover(ALBUM)).toBe(DEEZER_COVER);
    expect(deezerCalls()).toHaveLength(1);
  });

  it("searches by artist and album with their quotes removed, a limit of 10 and a timeout", async () => {
    const { resolveCover, deezerCalls } = setup(noCover);
    await resolveCover({ catalogId: CATALOG_ID, title: 'Say "Yes"', artist: 'The "Real" Band' });

    const [url, init] = deezerCalls()[0];
    const parsed = new URL(String(url));
    expect(parsed.origin + parsed.pathname).toBe("https://api.deezer.com/search/album");
    expect(parsed.searchParams.get("q")).toBe('artist:"The Real Band" album:"Say Yes"');
    expect(parsed.searchParams.get("limit")).toBe("10");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("asks for no redirects", async () => {
    const { resolveCover, deezerCalls } = setup(noCover);
    await resolveCover(ALBUM);

    expect(deezerCalls()[0][1]).toMatchObject({ redirect: "error" });
  });

  it.each([
    { name: "a Content-Length over 1 MB", reply: () => new Response("{}", { headers: { "Content-Length": String(1_048_577) } }) },
    { name: "a body over 1 MB with no Content-Length", reply: () => new Response(new Blob([" ".repeat(1_048_577)]).stream()) },
  ])("fails the search, logged, on $name", async ({ reply }) => {
    const { resolveCover, lookupCover, log } = setup(noCover, reply);

    expect(await lookupCover(ALBUM)).toEqual({ kind: "failed" });
    expect(await resolveCover(ALBUM)).toBeNull();
    expect(log).toHaveBeenCalledTimes(2);
  });

  it("skips an entry with a name over 300 characters without normalising it, and matches the next", async () => {
    const huge = " ".repeat(80_000);
    const { resolveCover } = setup(
      noCover,
      json({ data: [deezerAlbum(huge, "Miles Davis"), deezerAlbum("Kind of Blue", huge), deezerAlbum("Kind of Blue", "Miles Davis")] }),
    );

    const started = performance.now();
    expect(await resolveCover(ALBUM)).toBe(DEEZER_COVER);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it("reads only the first 10 entries", async () => {
    const filler = Array.from({ length: 10 }, () => deezerAlbum("Other", "Someone"));
    const { resolveCover } = setup(noCover, json({ data: [...filler, deezerAlbum("Kind of Blue", "Miles Davis")] }));

    expect(await resolveCover(ALBUM)).toBeNull();
  });

  it("takes the first result that matches, skipping the ones that don't", async () => {
    const other = "https://e-cdns-images.dzcdn.net/images/cover/other/250x250.jpg";
    const { resolveCover } = setup(
      noCover,
      json({ data: [deezerAlbum("Kind of Blue Live", "Miles Davis", other), deezerAlbum("Kind of Blue", "Miles Davis"), deezerAlbum("Kind of Blue", "Miles Davis", other)] }),
    );

    expect(await resolveCover(ALBUM)).toBe(DEEZER_COVER);
  });

  it("accepts the second Deezer CDN host", async () => {
    const cover = "https://e-cdns-images.dzcdn.net/images/cover/abc/250x250.jpg";
    const { resolveCover } = setup(noCover, json({ data: [deezerAlbum("Kind of Blue", "Miles Davis", cover)] }));

    expect(await resolveCover(ALBUM)).toBe(cover);
  });

  it.each([
    { name: "no results", reply: json({ data: [] }) },
    { name: "a result by another artist", reply: json({ data: [deezerAlbum("Kind of Blue", "Bill Evans")] }) },
    { name: "a result with another title", reply: json({ data: [deezerAlbum("Blue", "Miles Davis")] }) },
    { name: "a cover on another host", reply: json({ data: [deezerAlbum("Kind of Blue", "Miles Davis", "https://evil.example/c.jpg")] }) },
    { name: "a look-alike CDN host", reply: json({ data: [deezerAlbum("Kind of Blue", "Miles Davis", "https://cdn-images.dzcdn.net.evil.com/c.jpg")] }) },
    { name: "a cover over plain http", reply: json({ data: [deezerAlbum("Kind of Blue", "Miles Davis", "http://cdn-images.dzcdn.net/c.jpg")] }) },
    { name: "a cover URL over 300 characters", reply: json({ data: [deezerAlbum("Kind of Blue", "Miles Davis", `https://cdn-images.dzcdn.net/${"x".repeat(300)}`)] }) },
    { name: "a match with no cover", reply: json({ data: [{ title: "Kind of Blue", artist: { name: "Miles Davis" } }] }) },
    { name: "Deezer's stock no-artwork cover (empty md5_image)", reply: json({ data: [deezerAlbum("Kind of Blue", "Miles Davis", "https://cdn-images.dzcdn.net/images/cover//250x250-000000-80-0-0.jpg", "")] }) },
    { name: "a match with no md5_image", reply: json({ data: [{ title: "Kind of Blue", cover_medium: DEEZER_COVER, artist: { name: "Miles Davis" } }] }) },
    { name: "a cover URL with an empty cover path segment", reply: json({ data: [deezerAlbum("Kind of Blue", "Miles Davis", "https://cdn-images.dzcdn.net/images/cover//250x250.jpg")] }) },
    { name: "a result with no artist", reply: json({ data: [{ title: "Kind of Blue", cover_medium: DEEZER_COVER }] }) },
    { name: "a 500", reply: new Response("oops", { status: 500 }) },
    { name: "a network error", reply: new TypeError("fetch failed") },
    { name: "a timeout", reply: new DOMException("timed out", "TimeoutError") },
    { name: "a body that is not JSON", reply: new Response("<html>", { status: 200 }) },
    { name: "an error object instead of a result list", reply: json({ error: { type: "Exception", code: 4 } }) },
    { name: "a result list that is not a list", reply: json({ data: "nope" }) },
    { name: "a body of null", reply: json(null) },
  ])("returns null for $name", async ({ reply }) => {
    const { resolveCover } = setup(noCover, reply);

    expect(await resolveCover(ALBUM)).toBeNull();
  });

  it("logs a Deezer failure instead of throwing", async () => {
    const { resolveCover, log } = setup(noCover, new TypeError("fetch failed"));

    expect(await resolveCover(ALBUM)).toBeNull();
    expect(log).toHaveBeenCalledOnce();
  });

  it("returns null without asking Deezer when the title normalises to nothing, so another all-punctuation title can't match it", async () => {
    const { resolveCover, deezerCalls } = setup(noCover, json({ data: [deezerAlbum("???", "Miles Davis")] }));

    expect(await resolveCover({ ...ALBUM, title: "!!!" })).toBeNull();
    expect(deezerCalls()).toHaveLength(0);
  });
});

describe("pacing lookups", () => {
  /** Fake timers move the clock and the waits together, so the test does not wait. */
  function paced() {
    const starts: number[] = [];
    const fetchMock = vi.fn<typeof fetch>(async () => {
      starts.push(Date.now() - T0);
      return new Response(null, { status: 200 });
    });
    const sleep = vi.fn((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    const resolveCover = createResolveCover({ fetch: fetchMock, log: vi.fn(), now: () => Date.now(), sleep });
    return { resolveCover, fetchMock, sleep, starts };
  }
  const T0 = 1_000_000;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });
  afterEach(() => vi.useRealTimers());

  it("starts lookups made together at least 1100 ms apart", async () => {
    const { resolveCover, starts } = paced();

    const all = Promise.all([resolveCover(ALBUM), resolveCover(ALBUM), resolveCover(ALBUM)]);
    await vi.advanceTimersByTimeAsync(10_000);
    await all;

    expect(starts).toEqual([0, 1100, 2200]);
  });

  it("does not wait when the last lookup started long enough ago", async () => {
    const { resolveCover, sleep } = paced();

    await resolveCover(ALBUM);
    await vi.advanceTimersByTimeAsync(1100);
    await resolveCover(ALBUM);

    expect(sleep).not.toHaveBeenCalled();
  });

  it.each([
    { name: "4.4 s is waited out", lookups: 5, skipped: false },
    { name: "5.5 s is skipped with no request", lookups: 6, skipped: true },
  ])("a lookup that would wait $name", async ({ lookups, skipped }) => {
    // Lookups made together reserve starts 0, 1.1, 2.2 ... s ahead.
    const { resolveCover, fetchMock } = paced();
    const all = Promise.all(Array.from({ length: lookups }, () => resolveCover(ALBUM)));
    await vi.advanceTimersByTimeAsync(10_000);
    const results = await all;

    expect(results[lookups - 1] === null).toBe(skipped);
    expect(fetchMock).toHaveBeenCalledTimes(skipped ? lookups - 1 : lookups);
  });

  it("does not take a slot for a query that makes no request", async () => {
    const { resolveCover, fetchMock, sleep } = paced();

    const bad = await Promise.all([resolveCover({ ...ALBUM, catalogId: "x" }), resolveCover({ ...ALBUM, title: "a".repeat(301) })]);
    await resolveCover(ALBUM);

    expect(bad).toEqual([null, null]);
    expect(sleep).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not pace without a clock", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 200 }));
    const resolveCover = createResolveCover({ fetch: fetchMock, log: vi.fn() });

    await Promise.all([resolveCover(ALBUM), resolveCover(ALBUM)]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("normalizeForMatch", () => {
  it.each([
    { name: "case", a: "KIND OF BLUE", b: "kind of blue" },
    { name: "accents", a: "Béyoncé", b: "Beyonce" },
    { name: "a leading The", a: "The Beatles", b: "Beatles" },
    { name: "&", a: "Simon & Garfunkel", b: "Simon and Garfunkel" },
    { name: "punctuation and spacing", a: "Sgt. Pepper's  Lonely Hearts", b: "sgt peppers lonely hearts" },
    { name: "a (Deluxe Edition) tag", a: "Abbey Road (Deluxe Edition)", b: "Abbey Road" },
    { name: "a [Remastered 2011] tag", a: "Rumours [Remastered 2011]", b: "Rumours" },
    { name: "an (Expanded) tag", a: "Nevermind (Expanded)", b: "Nevermind" },
    { name: "a (25th Anniversary Edition) tag", a: "Purple Rain (25th Anniversary Edition)", b: "Purple Rain" },
    { name: "a (Bonus Track Version) tag", a: "Thriller (Bonus Track Version)", b: "Thriller" },
    { name: "full-width letters", a: "ＡＢＣ", b: "abc" },
  ])("treats $a and $b as the same ($name)", ({ a, b }) => {
    expect(normalizeForMatch(a)).toBe(normalizeForMatch(b));
    expect(normalizeForMatch(a)).not.toBe("");
  });

  it.each([
    { name: "a live album", a: "Abbey Road", b: "Abbey Road Live" },
    { name: "a bracketed tag that is not an edition tag", a: "Abbey Road (Live)", b: "Abbey Road" },
    { name: "a (Live Version) tag", a: "Abbey Road (Live Version)", b: "Abbey Road" },
    { name: "a [Acoustic Edition] tag", a: "Unplugged [Acoustic Edition]", b: "Unplugged" },
    { name: "a different artist", a: "Miles Davis", b: "Miles Davies" },
    { name: "a tag in the middle", a: "Abbey (Deluxe) Road", b: "Abbey Road" },
    { name: "a different title", a: "Blue", b: "Kind of Blue" },
  ])("keeps $a and $b apart ($name)", ({ a, b }) => {
    expect(normalizeForMatch(a)).not.toBe(normalizeForMatch(b));
  });

  it("reduces a name made only of punctuation to nothing", () => {
    expect(normalizeForMatch("!!!")).toBe("");
  });
});

describe("isAllowedCoverUrl", () => {
  it.each([
    { name: "a CAA URL", url: CAA, allowed: true },
    { name: "a Deezer CDN URL", url: DEEZER_COVER, allowed: true },
    { name: "the second Deezer CDN host", url: "https://e-cdns-images.dzcdn.net/images/cover/a/250x250.jpg", allowed: true },
    { name: "plain http", url: "http://coverartarchive.org/x", allowed: false },
    { name: "another host", url: "https://example.com/cover.jpg", allowed: false },
    { name: "a look-alike host", url: "https://coverartarchive.org.evil.com/x", allowed: false },
    { name: "a host that only starts like CAA", url: "https://coverartarchive.orgevil.com/x", allowed: false },
    { name: "a credentials trick", url: "https://coverartarchive.org@evil.com/x", allowed: false },
    { name: "a custom port", url: "https://coverartarchive.org:8443/x", allowed: false },
    { name: "text that is not a URL", url: "coverartarchive.org/x", allowed: false },
    { name: "a URL over 300 characters", url: `https://coverartarchive.org/${"x".repeat(300)}`, allowed: false },
  ])("$name: $allowed", ({ url, allowed }) => {
    expect(isAllowedCoverUrl(url)).toBe(allowed);
  });
});
