// No `server-only` and only relative imports, so the import script can load this under Node's type stripping.
import { MAX_BODY_BYTES, readJsonCapped } from "./read-json.ts";

const DEFAULT_CAA_URL = "https://coverartarchive.org";
const DEFAULT_DEEZER_URL = "https://api.deezer.com";
const DEEZER_RESULT_LIMIT = 10;
const REQUEST_TIMEOUT_MS = 5000;
const MAX_COVER_URL_LENGTH = 300;
const MAX_NAME_LENGTH = 300;
/** Least time between the starts of two paced lookups, the MusicBrainz client's gap. One lookup is at most two requests. */
const LOOKUP_SPACING_MS = 1100;
/** A paced lookup that would wait longer than this is skipped. */
const MAX_QUEUE_WAIT_MS = 5000;
export const CATALOG_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Hosts a stored cover may come from: the Cover Art Archive and the two the Deezer CDN serves covers from. */
const COVER_HOSTS = new Set(["coverartarchive.org", "cdn-images.dzcdn.net", "e-cdns-images.dzcdn.net"]);
const DEEZER_COVER_HOSTS = new Set(["cdn-images.dzcdn.net", "e-cdns-images.dzcdn.net"]);

const EDITION_TAG = /\s*[([](?![^()[\]]*\b(?:live|acoustic|instrumental|demo|mono)\b)[^()[\]]*(?:deluxe|edition|remaster|expanded|anniversary|bonus|version)[^()[\]]*[)\]]\s*$/;

/**
 * Reduces an album title or artist name to letters and digits so two spellings of one name compare equal:
 * case, accents, "&" vs "and", a leading "The" and a trailing edition tag such as "(Deluxe Edition)" are ignored.
 */
export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .trim()
    .replace(EDITION_TAG, "")
    .replace(/^the\s+/, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function isHttpsUrlOn(value: string, hosts: Set<string>): boolean {
  if (value.length > MAX_COVER_URL_LENGTH) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && hosts.has(url.hostname) && url.port === "" && url.username === "" && url.password === "";
  } catch {
    return false;
  }
}

/** True for an `https://` URL, at most 300 characters, on the Cover Art Archive or the Deezer CDN. Parsed, not prefix-matched. */
export function isAllowedCoverUrl(value: string): boolean {
  return isHttpsUrlOn(value, COVER_HOSTS);
}

export type CoverQuery = { catalogId: string; title: string; artist: string };

export type CoverArtDeps = {
  fetch: typeof fetch;
  /** Sent to the Cover Art Archive, as MusicBrainz asks. */
  userAgent?: () => string;
  /** Base URL for the Cover Art Archive existence check only (tests and stand-ins). The stored URL is always the real one. */
  caaUrl?: () => string;
  /** Base URL of the Deezer API. Defaults to the real one; browser tests point it at a stub. */
  deezerUrl?: () => string;
  log?: (message: string, detail?: unknown) => void;
};

function deezerQuery(title: string, artist: string): string {
  const clean = (value: string) => value.replace(/"/g, "");
  return `artist:"${clean(artist)}" album:"${clean(title)}"`;
}

export type CoverLookup = { kind: "found"; url: string } | { kind: "none" } | { kind: "failed" };

/** Where a failed lookup failed, so `resolveCover` can keep the CAA URL after a CAA failure but not after a Deezer one. */
type FinderResult =
  | Exclude<CoverLookup, { kind: "failed" }>
  | { kind: "failed"; at: "caa"; caaUrl: string }
  | { kind: "failed"; at: "deezer" };

/** A query the lookup can ask about: a UUID catalog id and a title and artist of at most 300 characters. */
function isLookupable({ catalogId, title, artist }: CoverQuery): boolean {
  return CATALOG_ID.test(catalogId) && title.length <= MAX_NAME_LENGTH && artist.length <= MAX_NAME_LENGTH;
}

function createCoverFinder(deps: CoverArtDeps) {
  const log = deps.log ?? ((message, detail) => console.error(...(detail === undefined ? [message] : [message, detail])));

  async function askDeezer(title: string, artist: string): Promise<FinderResult> {
    // An empty name (such as "!!!") normalises to nothing and would match any other such name.
    const wantedTitle = normalizeForMatch(title);
    const wantedArtist = normalizeForMatch(artist);
    if (wantedTitle === "" || wantedArtist === "") return { kind: "none" };

    const params = new URLSearchParams({ q: deezerQuery(title, artist), limit: String(DEEZER_RESULT_LIMIT) });
    try {
      const response = await deps.fetch(`${deps.deezerUrl?.() ?? DEFAULT_DEEZER_URL}/search/album?${params}`, {
        headers: { Accept: "application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        log(`Deezer cover search for "${title}" answered ${response.status}`);
        return { kind: "failed", at: "deezer" };
      }
      const data = ((await readJsonCapped(response, MAX_BODY_BYTES)) as { data?: unknown } | null)?.data;
      if (!Array.isArray(data)) {
        log(`Deezer cover search for "${title}" had no result list`);
        return { kind: "failed", at: "deezer" };
      }

      // Deezer was asked for DEEZER_RESULT_LIMIT entries; read no more, whatever it sends.
      for (const entry of data.slice(0, DEEZER_RESULT_LIMIT)) {
        const album = entry as { title?: unknown; cover_medium?: unknown; md5_image?: unknown; artist?: { name?: unknown } } | null;
        if (typeof album?.title !== "string" || typeof album.artist?.name !== "string") continue;
        // The edition-tag regex is quadratic, so it never sees a name longer than the cap.
        if (album.title.length > MAX_NAME_LENGTH || album.artist.name.length > MAX_NAME_LENGTH) continue;
        if (normalizeForMatch(album.title) !== wantedTitle || normalizeForMatch(album.artist.name) !== wantedArtist) continue;
        const cover = album.cover_medium;
        // Deezer's stock "no artwork" image has an empty md5, so its URL path contains "/cover//".
        if (typeof album.md5_image !== "string" || album.md5_image === "") return { kind: "none" };
        if (typeof cover !== "string" || cover.includes("/cover//")) return { kind: "none" };
        return isHttpsUrlOn(cover, DEEZER_COVER_HOSTS) ? { kind: "found", url: cover } : { kind: "none" };
      }
      return { kind: "none" };
    } catch (error) {
      log(`Deezer cover search for "${title}" failed`, error);
      return { kind: "failed", at: "deezer" };
    }
  }

  return async function find({ catalogId, title, artist }: CoverQuery): Promise<FinderResult> {
    if (!isLookupable({ catalogId, title, artist })) return { kind: "none" };
    const id = catalogId.toLowerCase();
    // Only the HEAD check uses the configurable base; what gets stored is always the canonical URL.
    const checkUrl = `${deps.caaUrl?.() ?? DEFAULT_CAA_URL}/release-group/${id}/front-250`;
    const caaUrl = `${DEFAULT_CAA_URL}/release-group/${id}/front-250`;
    try {
      const response = await deps.fetch(checkUrl, {
        method: "HEAD",
        redirect: "manual",
        headers: deps.userAgent ? { "User-Agent": deps.userAgent() } : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.status < 400) return { kind: "found", url: caaUrl };
      if (response.status !== 404) {
        log(`Cover Art Archive answered ${response.status} for ${catalogId}`);
        return { kind: "failed", at: "caa", caaUrl };
      }
    } catch (error) {
      log(`Cover Art Archive check failed for ${catalogId}`, error);
      return { kind: "failed", at: "caa", caaUrl };
    }
    return askDeezer(title, artist);
  };
}

/**
 * Builds `lookupCover`, which finds the cover for a catalog album: the Cover Art Archive's when it has one, else
 * Deezer's cover for an album with the same title and artist. It tells "no cover" (`none`) from "couldn't tell"
 * (`failed`: a CAA answer other than 2xx, 3xx or 404, a network error or timeout, or a failed Deezer search).
 * Never throws. A catalog id that isn't a UUID, or a title or artist over 300 characters, is `none` without a request.
 */
export function createLookupCover(deps: CoverArtDeps) {
  const find = createCoverFinder(deps);
  return async function lookupCover(query: CoverQuery): Promise<CoverLookup> {
    const result = await find(query);
    return result.kind === "failed" ? { kind: "failed" } : result;
  };
}

export type LookupCover = ReturnType<typeof createLookupCover>;

export type ResolveCoverDeps = CoverArtDeps & {
  /** The clock, in ms. Give `now` and `sleep` together to pace lookups; without them lookups are not paced. */
  now?: () => number;
  /** Waits for `ms`. */
  sleep?: (ms: number) => Promise<void>;
};

/**
 * Builds `resolveCover`, which gives the cover to store for a catalog album when it is added: the lookup's
 * cover, or null when there is none. When the Cover Art Archive can't be reached it gives the CAA URL anyway,
 * and lets the browser's placeholder cover a broken link; a failed Deezer search gives null. Never throws.
 *
 * With `now` and `sleep`, lookups go through a queue: each reserves a start at least 1100 ms after the previous
 * one's and waits for it. A lookup that would wait over 5 seconds is skipped (null, no request), so the album
 * is added without a cover and the backfill fills it later.
 */
export function createResolveCover(deps: ResolveCoverDeps) {
  const find = createCoverFinder(deps);
  const { now, sleep } = deps;
  // Earliest time the next lookup may start. Each lookup reserves the next slot.
  let nextSlot = 0;

  /** False when the wait is too long and the lookup should be skipped. */
  async function waitForSlot(): Promise<boolean> {
    if (!now || !sleep) return true;
    const current = now();
    const start = Math.max(current, nextSlot);
    const wait = start - current;
    if (wait > MAX_QUEUE_WAIT_MS) return false;
    nextSlot = start + LOOKUP_SPACING_MS;
    if (wait > 0) await sleep(wait);
    return true;
  }

  return async function resolveCover(query: CoverQuery): Promise<string | null> {
    // A query that makes no request does not take a slot.
    if (!isLookupable(query)) return null;
    if (!(await waitForSlot())) return null;
    const result = await find(query);
    if (result.kind === "found") return result.url;
    if (result.kind === "failed") return result.at === "caa" ? result.caaUrl : null;
    return null;
  };
}

export type ResolveCover = ReturnType<typeof createResolveCover>;
