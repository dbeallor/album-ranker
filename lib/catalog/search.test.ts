import { describe, expect, it, vi } from "vitest";
import fixture from "./fixtures/getz-gilberto.json";
import { buildQuery } from "./musicbrainz";
import { createSearchAlbums } from "./search";

const BUSY = "The album catalog is busy. Try again in a moment.";
const UNREACHABLE = "The album catalog couldn't be reached. Try again later.";

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
    const result = await search("getz gilberto");

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
    await search("getz gilberto");

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
    const result = await search("getz");

    expect(result.ok && result.albums.map((a) => a.catalogId)).toEqual([groups[0].id, groups[1].id]);
  });

  it("drops singles", async () => {
    const { search } = setup();
    const result = await search("getz gilberto");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.albums.map((a) => a.catalogId)).not.toContain("04722f19-343f-486a-9658-0bc7becad0db");
    expect(result.albums).toHaveLength(fixture["release-groups"].length - 1);
  });

  it("gives no year when the date is missing", async () => {
    const { search } = setup();
    const result = await search("getz gilberto");

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
    const result = await search("album");
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
    const result = await search("album");

    expect(result.ok && result.albums.map((a) => a.year)).toEqual(dates.map((d) => d.year));
  });
});

describe("searchAlbums short queries", () => {
  const cases = ["", " ", "a", "  a  "];

  it.each(cases)("makes no request for %j", async (query) => {
    const { search, fetchMock } = setup();

    expect(await search(query)).toEqual({ ok: true, albums: [] });
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

    expect(await search("getz gilberto")).toEqual({ ok: false, message });
    expect(log).toHaveBeenCalledTimes(1);
  });
});

describe("searchAlbums cache", () => {
  it("serves the same query in another case and spacing from the cache", async () => {
    const { search, fetchMock } = setup();
    const first = await search("Getz Gilberto");
    const second = await search("  getz   GILBERTO ");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it("does not cache an error", async () => {
    let fail = true;
    const { search, fetchMock } = setup(() => (fail ? new Response("busy", { status: 503 }) : jsonResponse(fixture)));

    expect((await search("getz gilberto")).ok).toBe(false);
    fail = false;
    expect((await search("getz gilberto")).ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("asks again after 24 hours", async () => {
    const { search, fetchMock, advance } = setup();
    await search("getz gilberto");
    advance(24 * 60 * 60 * 1000 + 1);
    await search("getz gilberto");

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("drops the oldest query past 500", async () => {
    const { search, fetchMock, advance } = setup();
    for (let i = 0; i < 501; i++) {
      advance(2000);
      await search(`query ${i}`);
    }
    expect(fetchMock).toHaveBeenCalledTimes(501);

    await search("query 500");
    expect(fetchMock).toHaveBeenCalledTimes(501);
    await search("query 0");
    expect(fetchMock).toHaveBeenCalledTimes(502);
  });
});

describe("searchAlbums rate limit", () => {
  it("spaces requests at least 1.1 seconds apart", async () => {
    const { search, sleep } = setup();
    await search("first query");
    await search("second query");

    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(1100);
  });

  it("returns the busy message when the wait would pass 5 seconds", async () => {
    const { search, fetchMock } = setup();
    const results = await Promise.all(["one", "two", "three", "four", "five", "six"].map((q) => search(q)));

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
      text: "ac/dc (live)",
      expected: "(releasegroup:ac\\/dc OR artist:ac\\/dc) AND (releasegroup:\\(live\\) OR artist:\\(live\\))",
    },
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
