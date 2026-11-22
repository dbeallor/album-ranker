// No `server-only` and only relative imports, so the import script can load this under Node's type stripping.

const CAA_URL = "https://coverartarchive.org/release-group";
const DEEZER_SEARCH_URL = "https://api.deezer.com/search/album";
const DEEZER_RESULT_LIMIT = 10;
const REQUEST_TIMEOUT_MS = 5000;
const MAX_COVER_URL_LENGTH = 300;
const MAX_NAME_LENGTH = 300;
const CATALOG_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  log?: (message: string, detail?: unknown) => void;
};

function deezerQuery(title: string, artist: string): string {
  const clean = (value: string) => value.replace(/"/g, "");
  return `artist:"${clean(artist)}" album:"${clean(title)}"`;
}

/**
 * Builds `resolveCover`, which gives the cover to store for a catalog album: the Cover Art Archive's when it
 * has one, else Deezer's cover for an album with the same title and artist, else null. Never throws. A catalog
 * id that isn't a UUID, or a title or artist over 300 characters, gets null without a request: the browser can send anything.
 */
export function createResolveCover(deps: CoverArtDeps) {
  const log = deps.log ?? ((message, detail) => console.error(...(detail === undefined ? [message] : [message, detail])));

  async function askDeezer(title: string, artist: string): Promise<string | null> {
    // An empty name (such as "!!!") normalises to nothing and would match any other such name.
    const wantedTitle = normalizeForMatch(title);
    const wantedArtist = normalizeForMatch(artist);
    if (wantedTitle === "" || wantedArtist === "") return null;

    const params = new URLSearchParams({ q: deezerQuery(title, artist), limit: String(DEEZER_RESULT_LIMIT) });
    try {
      const response = await deps.fetch(`${DEEZER_SEARCH_URL}?${params}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        log(`Deezer cover search for "${title}" answered ${response.status}`);
        return null;
      }
      const data = ((await response.json()) as { data?: unknown } | null)?.data;
      if (!Array.isArray(data)) {
        log(`Deezer cover search for "${title}" had no result list`);
        return null;
      }

      for (const entry of data) {
        const album = entry as { title?: unknown; cover_medium?: unknown; md5_image?: unknown; artist?: { name?: unknown } } | null;
        if (typeof album?.title !== "string" || typeof album.artist?.name !== "string") continue;
        if (normalizeForMatch(album.title) !== wantedTitle || normalizeForMatch(album.artist.name) !== wantedArtist) continue;
        const cover = album.cover_medium;
        // Deezer's stock "no artwork" image has an empty md5, so its URL path contains "/cover//".
        if (typeof album.md5_image !== "string" || album.md5_image === "") return null;
        if (typeof cover !== "string" || cover.includes("/cover//")) return null;
        return isHttpsUrlOn(cover, DEEZER_COVER_HOSTS) ? cover : null;
      }
      return null;
    } catch (error) {
      log(`Deezer cover search for "${title}" failed`, error);
      return null;
    }
  }

  return async function resolveCover({ catalogId, title, artist }: CoverQuery): Promise<string | null> {
    if (!CATALOG_ID.test(catalogId) || title.length > MAX_NAME_LENGTH || artist.length > MAX_NAME_LENGTH) return null;
    const caaUrl = `${CAA_URL}/${catalogId.toLowerCase()}/front-250`;
    try {
      const response = await deps.fetch(caaUrl, {
        method: "HEAD",
        redirect: "manual",
        headers: deps.userAgent ? { "User-Agent": deps.userAgent() } : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.status !== 404) {
        if (response.status >= 400) log(`Cover Art Archive answered ${response.status} for ${catalogId}`);
        return caaUrl;
      }
    } catch (error) {
      // Can't tell whether CAA has a cover; keep its URL and let the browser's placeholder cover a broken link.
      log(`Cover Art Archive check failed for ${catalogId}`, error);
      return caaUrl;
    }
    return askDeezer(title, artist);
  };
}

export type ResolveCover = ReturnType<typeof createResolveCover>;
