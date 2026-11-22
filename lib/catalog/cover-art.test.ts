// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createResolveCover, isAllowedCoverUrl, normalizeForMatch } from "./cover-art";

const CATALOG_ID = "11111111-2222-3333-4444-555555555555";
const CAA = `https://coverartarchive.org/release-group/${CATALOG_ID}/front-250`;
const DEEZER_COVER = "https://cdn-images.dzcdn.net/images/cover/abc/250x250-000000-80-0-0.jpg";
const ALBUM = { catalogId: CATALOG_ID, title: "Kind of Blue", artist: "Miles Davis" };

type Reply = Response | Error;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function deezerAlbum(title: string, artist: string, cover: unknown = DEEZER_COVER) {
  return { title, cover_medium: cover, artist: { name: artist } };
}

/** A fake fetch: `caa` answers the Cover Art Archive HEAD, `deezer` answers the Deezer search. */
function setup(caa: Reply | (() => Reply), deezer: Reply | (() => Reply) = () => json({ data: [] })) {
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    const reply = url.startsWith("https://coverartarchive.org/") ? caa : deezer;
    const result = typeof reply === "function" ? reply() : reply;
    if (result instanceof Error) throw result;
    return result;
  });
  const log = vi.fn();
  const resolveCover = createResolveCover({ fetch: fetchMock, userAgent: () => "album-ranker-test/1", log });
  const calls = (host: string) => fetchMock.mock.calls.filter(([input]) => String(input).startsWith(host));
  return { resolveCover, fetchMock, log, caaCalls: () => calls("https://coverartarchive.org/"), deezerCalls: () => calls("https://api.deezer.com/") };
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

  it("returns null when the title normalises to nothing, so another all-punctuation title can't match it", async () => {
    const { resolveCover } = setup(noCover, json({ data: [deezerAlbum("???", "Miles Davis")] }));

    expect(await resolveCover({ ...ALBUM, title: "!!!" })).toBeNull();
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
