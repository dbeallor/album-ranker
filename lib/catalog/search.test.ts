import { describe, expect, it, vi } from "vitest";
import fixture from "./fixtures/getz-gilberto.json";
import { buildFieldsQuery, buildQuery } from "./musicbrainz";
import { createSearchAlbums } from "./search";
import type { CatalogQuery } from "./types";

const BUSY = "The album catalog is busy. Try again in a moment.";
const UNREACHABLE = "The album catalog couldn't be reached. Try again later.";

const text = (value: string): CatalogQuery => ({ kind: "text", text: value });

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function setup(respond: () => Response | Promise<Response> = () => jsonResponse(fixture)) {
  let time = 0;
  const fetchMock = vi.fn<typeof fetch>(async () => respond());
  const sleep = vi.fn(async (ms: number) => {
    await Promise.resolve();
    time += ms;
  });
  const log = vi.fn();
  const search = createSearchAlbums({
    fetch: fetchMock,
    now: () => time,
    sleep,
    userAgent: () => "test-agent/1.0",
    log,
  });
  return {
    search,
    fetchMock,
    sleep,
    log,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

describe("searchAlbums results", () => {
  it("maps the getz gilberto fixture", async () => {
    const { search } = setup();
    const result = await search(text("getz gilberto"));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const album = result.albums.find((a) => a.catalogId === "b248d212-aace-3c3e-a23d-e13aaac1f87a");
    expect(album).toEqual({
      catalogId: "b248d212-aace-3c3e-a23d-e13aaac1f87a",
      title: "Getz / Gilberto",
      artist: "Stan Getz / João Gilberto featuring Antônio Carlos Jobim",
      artistId:
        "8f2422ab-0ec6-4c92-80c4-afe9622fab32+286ec4c2-b5ca-4f85-b331-280a6d73dd14+7a8dbe84-f4c0-4457-bfa3-edced1f8cde0",
      year: 1964,
      coverUrl: "https://coverartarchive.org/release-group/b248d212-aace-3c3e-a23d-e13aaac1f87a/front-250",
    });
  });

  it("sends the user agent, JSON format and limit", async () => {
    const { search, fetchMock } = setup();
    await search(text("getz gilberto"));

    const [url, init] = fetchMock.mock.calls[0];
    const parsed = new URL(String(url));
    expect(parsed.origin + parsed.pathname).toBe("https://musicbrainz.org/ws/2/release-group");
    expect(parsed.searchParams.get("fmt")).toBe("json");
    expect(parsed.searchParams.get("limit")).toBe("25");
    expect(parsed.searchParams.get("query")).toBe(buildQuery("getz gilberto"));
    expect((init?.headers as Record<string, string>)["User-Agent"]).toBe("test-agent/1.0");
  });

  it("keeps a release group listed twice once", async () => {
    const groups = fixture["release-groups"];
    const { search } = setup(() => jsonResponse({ "release-groups": [groups[0], groups[1], groups[0]] }));
    const result = await search(text("getz"));

    expect(result.ok && result.albums.map((a) => a.catalogId)).toEqual([groups[0].id, groups[1].id]);
  });

  it("drops singles", async () => {
    const { search } = setup();
    const result = await search(text("getz gilberto"));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.albums.map((a) => a.catalogId)).not.toContain("04722f19-343f-486a-9658-0bc7becad0db");
    expect(result.albums).toHaveLength(fixture["release-groups"].length - 1);
  });

  it("gives no year when the date is missing", async () => {
    const { search } = setup();
    const result = await search(text("getz gilberto"));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const undated = result.albums.find((a) => a.catalogId === "05e450b0-35a8-421c-8e74-047cd4c0cebf");
    expect(undated?.year).toBeNull();
  });

  const credits: { name: string; credit: unknown; artistId: string | null }[] = [
    { name: "one artist", credit: [{ name: "A", artist: { id: "id-a", name: "A" } }], artistId: "id-a" },
    {
      name: "a collaboration joins ids with +",
      credit: [
        { name: "A", joinphrase: " & ", artist: { id: "id-a", name: "A" } },
        { name: "B", artist: { id: "id-b", name: "B" } },
      ],
      artistId: "id-a+id-b",
    },
    { name: "a credit with no ids", credit: [{ name: "A" }], artistId: null },
    { name: "a missing credit", credit: undefined, artistId: null },
  ];
  it.each(credits)("gives the artist id for $name", async ({ credit, artistId }) => {
    const group = { id: "g1", title: "T", "primary-type": "Album", "artist-credit": credit };
    const { search } = setup(() => jsonResponse({ "release-groups": [group] }));
    const result = await search(text("album"));
    expect(result.ok && result.albums[0].artistId).toBe(artistId);
  });

  it("reads the year from full and partial dates", async () => {
    const dates = [
      { date: "1964-03", year: 1964 },
      { date: "2016-02-19", year: 2016 },
      { date: "1998", year: 1998 },
      { date: "", year: null },
    ];
    const groups = dates.map(({ date }, i) => ({
      id: `id-${i}`,
      title: `Album ${i}`,
      "primary-type": "Album",
      "first-release-date": date,
      "artist-credit": [{ name: "Someone" }],
    }));
    const { search } = setup(() => jsonResponse({ "release-groups": groups }));
    const result = await search(text("album"));

    expect(result.ok && result.albums.map((a) => a.year)).toEqual(dates.map((d) => d.year));
  });
});

describe("searchAlbums short queries", () => {
  const cases = ["", " ", "a", "  a  "];

  it.each(cases)("makes no request for %j", async (query) => {
    const { search, fetchMock } = setup();

    expect(await search(text(query))).toEqual({ ok: true, albums: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("searchAlbums errors", () => {
  const timeout = () => {
    throw new DOMException("The operation timed out.", "TimeoutError");
  };
  const cases: { name: string; respond: () => Response | Promise<Response>; message: string }[] = [
    { name: "503", respond: () => new Response("busy", { status: 503 }), message: BUSY },
    { name: "timeout", respond: timeout, message: BUSY },
    { name: "500", respond: () => new Response("oops", { status: 500 }), message: UNREACHABLE },
    {
      name: "network error",
      respond: () => {
        throw new TypeError("fetch failed");
      },
      message: UNREACHABLE,
    },
    { name: "malformed JSON", respond: () => new Response("<html>nope</html>", { status: 200 }), message: UNREACHABLE },
    { name: "JSON without a release-groups list", respond: () => jsonResponse({ error: "x" }), message: UNREACHABLE },
  ];

  it.each(cases)("$name returns a message and logs it", async ({ respond, message }) => {
    const { search, log } = setup(respond);

    expect(await search(text("getz gilberto"))).toEqual({ ok: false, message });
    expect(log).toHaveBeenCalledTimes(1);
  });
});

describe("searchAlbums cache", () => {
  it("serves the same query in another case and spacing from the cache", async () => {
    const { search, fetchMock } = setup();
    const first = await search(text("Getz Gilberto"));
    const second = await search(text("  getz   GILBERTO "));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it("does not cache an error", async () => {
    let fail = true;
    const { search, fetchMock } = setup(() => (fail ? new Response("busy", { status: 503 }) : jsonResponse(fixture)));

    expect((await search(text("getz gilberto"))).ok).toBe(false);
    fail = false;
    expect((await search(text("getz gilberto"))).ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("asks again after 24 hours", async () => {
    const { search, fetchMock, advance } = setup();
    await search(text("getz gilberto"));
    advance(24 * 60 * 60 * 1000 + 1);
    await search(text("getz gilberto"));

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("drops the oldest query past 500", async () => {
    const { search, fetchMock, advance } = setup();
    for (let i = 0; i < 501; i++) {
      advance(2000);
      await search(text(`query ${i}`));
    }
    expect(fetchMock).toHaveBeenCalledTimes(501);

    await search(text("query 500"));
    expect(fetchMock).toHaveBeenCalledTimes(501);
    await search(text("query 0"));
    expect(fetchMock).toHaveBeenCalledTimes(502);
  });
});

describe("searchAlbums rate limit", () => {
  it("spaces requests at least 1.1 seconds apart", async () => {
    const { search, sleep } = setup();
    await search(text("first query"));
    await search(text("second query"));

    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(1100);
  });

  it("returns the busy message when the wait would pass 5 seconds", async () => {
    const { search, fetchMock } = setup();
    const results = await Promise.all(["one", "two", "three", "four", "five", "six"].map((q) => search(text(q))));

    // Waits of 0, 1.1, 2.2, 3.3, 4.4 and 5.5 seconds: the sixth is turned away.
    expect(results.slice(0, 5).every((r) => r.ok)).toBe(true);
    expect(results[5]).toEqual({ ok: false, message: BUSY });
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});

describe("buildQuery", () => {
  const cases: { name: string; text: string; expected: string }[] = [
    {
      name: "splits words and matches title or artist",
      text: "getz gilberto",
      expected: "(releasegroup:getz OR artist:getz) AND (releasegroup:gilberto OR artist:gilberto)",
    },
    {
      name: "trims and collapses spaces",
      text: "  kind   of  blue ",
      expected:
        "(releasegroup:kind OR artist:kind) AND (releasegroup:of OR artist:of) AND (releasegroup:blue OR artist:blue)",
    },
    {
      name: "escapes Lucene special characters",
      text: "(live) what's^",
      expected:
        "(releasegroup:\\(live\\) OR artist:\\(live\\)) AND (releasegroup:what's\\^ OR artist:what's\\^)",
    },
    {
      name: "splits a word at a slash",
      text: "Getz/Gilberto ac/dc",
      expected:
        "(releasegroup:Getz OR artist:Getz) AND (releasegroup:Gilberto OR artist:Gilberto) AND (releasegroup:ac OR artist:ac) AND (releasegroup:dc OR artist:dc)",
    },
    {
      name: "drops words that are only punctuation",
      text: "Stan Getz & Joao - Gilberto + / x",
      expected:
        "(releasegroup:Stan OR artist:Stan) AND (releasegroup:Getz OR artist:Getz) AND (releasegroup:Joao OR artist:Joao) AND (releasegroup:Gilberto OR artist:Gilberto) AND (releasegroup:x OR artist:x)",
    },
    { name: "is empty for punctuation alone", text: "& - /", expected: "" },
    {
      name: "escapes quotes, colons and wildcards",
      text: 'what"s: up*',
      expected: '(releasegroup:what\\"s\\: OR artist:what\\"s\\:) AND (releasegroup:up\\* OR artist:up\\*)',
    },
    {
      name: "keeps the word AND from acting as an operator",
      text: "this AND that",
      expected:
        "(releasegroup:this OR artist:this) AND (releasegroup:and OR artist:and) AND (releasegroup:that OR artist:that)",
    },
    {
      name: "cuts the text to 200 characters",
      text: "a".repeat(250),
      expected: `(releasegroup:${"a".repeat(200)} OR artist:${"a".repeat(200)})`,
    },
  ];

  it.each(cases)("$name", ({ text, expected }) => {
    expect(buildQuery(text)).toBe(expected);
  });
});

describe("buildFieldsQuery", () => {
  const cases: { name: string; query: { title?: string; artist?: string }; expected: string }[] = [
    {
      name: "needs every title word and some artist word",
      query: { title: "Kind of Blue", artist: "Miles Davis" },
      expected: "(releasegroup:kind AND releasegroup:of AND releasegroup:blue) AND (artist:miles~1 OR artist:davis~1)",
    },
    {
      name: "allows a typo only in words of 5 or more letters",
      query: { title: "Meet the Tempations", artist: "The Temptations" },
      expected:
        "(releasegroup:meet AND releasegroup:the AND releasegroup:tempations~1) AND (artist:temptations~1)",
    },
    {
      name: "leaves the and the out of the artist words, but not out of the title",
      query: { title: "The Band", artist: "The Band and The Horses" },
      expected: "(releasegroup:the AND releasegroup:band) AND (artist:band OR artist:horses~1)",
    },
    {
      name: "keeps the and the when the artist has no other word",
      query: { artist: "The And" },
      expected: "(artist:the OR artist:and)",
    },
    {
      name: "can ask for the title alone",
      query: { title: "Portraits in Jazz" },
      expected: "(releasegroup:portraits~1 AND releasegroup:in AND releasegroup:jazz)",
    },
    { name: "can ask for the artist alone", query: { artist: "Bill Evans" }, expected: "(artist:bill OR artist:evans~1)" },
    {
      name: "splits at a slash, drops lone punctuation and escapes the rest",
      query: { title: "Getz/Gilberto", artist: "Stan & (Joao)" },
      expected: "(releasegroup:getz AND releasegroup:gilberto~1) AND (artist:stan OR artist:\\(joao\\))",
    },
    {
      name: "keeps the word AND from acting as an operator",
      query: { title: "This AND That" },
      expected: "(releasegroup:this AND releasegroup:and AND releasegroup:that)",
    },
    { name: "is empty with no words", query: { title: " & ", artist: "" }, expected: "" },
  ];

  it.each(cases)("$name", ({ query, expected }) => {
    expect(buildFieldsQuery(query)).toBe(expected);
  });
});

describe("searchAlbums fields queries", () => {
  it("sends the fields query to the catalog", async () => {
    const { search, fetchMock } = setup();
    await search({ kind: "fields", title: "Getz Gilberto", artist: "Stan Getz" });

    const parsed = new URL(String(fetchMock.mock.calls[0][0]));
    expect(parsed.searchParams.get("query")).toBe(
      buildFieldsQuery({ title: "Getz Gilberto", artist: "Stan Getz" }),
    );
  });

  it("keys the cache on the query kind, so text and fields queries do not share an answer", async () => {
    const { search, fetchMock } = setup();
    await search(text("getz gilberto"));
    await search({ kind: "fields", title: "getz gilberto" });
    await search({ kind: "fields", artist: "getz gilberto" });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // The same queries again, in another case and spacing, come from the cache.
    await search(text(" Getz  Gilberto "));
    await search({ kind: "fields", title: "GETZ gilberto" });
    await search({ kind: "fields", artist: "getz   gilberto" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("keeps a title and an artist apart in the cache key", async () => {
    const { search, fetchMock } = setup();
    await search({ kind: "fields", title: "getz", artist: "gilberto" });
    await search({ kind: "fields", title: "gilberto", artist: "getz" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("makes no request for a query with no usable words", async () => {
    const { search, fetchMock } = setup();
    expect(await search({ kind: "fields", title: "", artist: "a" })).toEqual({ ok: true, albums: [] });
    expect(await search(text("& - /"))).toEqual({ ok: true, albums: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
