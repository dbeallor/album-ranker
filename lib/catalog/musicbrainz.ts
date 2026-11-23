import "server-only";
import { CATALOG_ID } from "./cover-art.ts";
import { isResponseTooLarge, MAX_BODY_BYTES, readJsonCapped } from "./read-json.ts";
import type { CatalogAlbum, CatalogQuery } from "./types";

const SEARCH_PATH = "/ws/2/release-group";
const COVER_URL = "https://coverartarchive.org/release-group";
export const MAX_QUERY_LENGTH = 200;
const RESULT_LIMIT = 25;
const REQUEST_SPACING_MS = 1100;
const MAX_QUEUE_WAIT_MS = 5000;
const REQUEST_TIMEOUT_MS = 8000;
const MAX_NAME_LENGTH = 300;
const MAX_ATTEMPTS = 4;
const MIN_RETRY_WAIT_MS = 1000;
const MAX_RETRY_WAIT_MS = 3000;

export type CatalogErrorKind = "busy" | "unreachable";

export class CatalogError extends Error {
  // Declared as a field, not a constructor parameter property, so Node's type stripping (the import script) can run it.
  readonly kind: CatalogErrorKind;

  constructor(kind: CatalogErrorKind, detail: string, options?: { cause?: unknown }) {
    super(detail, options);
    this.name = "CatalogError";
    this.kind = kind;
  }
}

const LUCENE_SPECIALS = /[+\-!(){}[\]^"~*?:\\/&|]/g;
const LUCENE_OPERATORS = new Set(["AND", "OR", "NOT"]);

function escapeWord(word: string): string {
  // Bare AND/OR/NOT are operators in Lucene; lower-cased they are plain words.
  if (LUCENE_OPERATORS.has(word)) {
    return word.toLowerCase();
  }
  return word.replace(LUCENE_SPECIALS, "\\$&");
}

/**
 * The words of a search text: a "/" inside a word splits it ("Getz/Gilberto" is two words), and words that are only
 * punctuation ("&", "-", "+") are dropped, since no album or artist contains them.
 */
function queryWords(text: string): string[] {
  return text
    .trim()
    .slice(0, MAX_QUERY_LENGTH)
    .replace(/\//g, " ")
    .split(/\s+/)
    .filter((word) => /[\p{L}\p{N}]/u.test(word));
}

/** Matches each word against the album title or the artist name. */
export function buildQuery(text: string): string {
  return queryWords(text)
    .map(escapeWord)
    .map((word) => `(releasegroup:${word} OR artist:${word})`)
    .join(" AND ");
}

const FUZZY_MIN_LETTERS = 5;

/** A word of 5 or more letters matches with one typo allowed ("~1"). */
function fieldTerm(field: string, word: string): string {
  const lower = word.toLowerCase();
  const fuzzy = (lower.match(/[\p{L}\p{N}]/gu) ?? []).length >= FUZZY_MIN_LETTERS ? "~1" : "";
  return `${field}:${escapeWord(lower)}${fuzzy}`;
}

/** Words that say nothing about who an artist is: with "or" between the artist words, they would match any artist with one. */
const ARTIST_FILLER = new Set(["the", "and"]);

/** The artist's words without "the" and "and", unless that would leave none. */
function artistQueryWords(artist: string): string[] {
  const words = queryWords(artist);
  const named = words.filter((word) => !ARTIST_FILLER.has(word.toLowerCase()));
  return named.length > 0 ? named : words;
}

/**
 * Every title word must be in the release group's title, and at least one artist word in its artist. The artist's
 * "the" and "and" are left out (see `artistQueryWords`), since one of them matching would be enough.
 */
export function buildFieldsQuery({ title = "", artist = "" }: { title?: string; artist?: string }): string {
  const titleWords = queryWords(title).map((word) => fieldTerm("releasegroup", word));
  const artistWords = artistQueryWords(artist).map((word) => fieldTerm("artist", word));
  const parts: string[] = [];
  if (titleWords.length > 0) parts.push(`(${titleWords.join(" AND ")})`);
  if (artistWords.length > 0) parts.push(`(${artistWords.join(" OR ")})`);
  return parts.join(" AND ");
}

/** The Lucene query for a catalog query; empty when it has no usable words. */
export function buildCatalogQuery(query: CatalogQuery): string {
  return query.kind === "text" ? buildQuery(query.text) : buildFieldsQuery(query);
}

type ArtistCredit = { name?: unknown; joinphrase?: unknown; artist?: { id?: unknown; name?: unknown } };

function isCreditEntry(part: unknown): part is ArtistCredit {
  return typeof part === "object" && part !== null && !Array.isArray(part);
}

function joinArtistCredit(credit: unknown): string {
  if (!Array.isArray(credit)) {
    return "";
  }
  return credit
    .filter(isCreditEntry)
    .map((part) => {
      const name =
        typeof part.name === "string" ? part.name : typeof part.artist?.name === "string" ? part.artist.name : "";
      const join = typeof part.joinphrase === "string" ? part.joinphrase : "";
      return name + join;
    })
    .join("")
    .trim();
}

function joinArtistIds(credit: unknown): string | null {
  if (!Array.isArray(credit)) {
    return null;
  }
  const ids = credit
    .filter(isCreditEntry)
    .flatMap((part) => (typeof part.artist?.id === "string" && CATALOG_ID.test(part.artist.id) ? [part.artist.id] : []));
  return ids.length > 0 ? ids.join("+") : null;
}

function parseYear(date: unknown): number | null {
  if (typeof date !== "string") {
    return null;
  }
  const match = /^(\d{4})/.exec(date);
  return match ? Number(match[1]) : null;
}

export function mapReleaseGroups(body: unknown): CatalogAlbum[] {
  const groups = (body as { "release-groups"?: unknown } | null)?.["release-groups"];
  if (!Array.isArray(groups)) {
    throw new CatalogError("unreachable", "response has no release-groups list");
  }

  const seen = new Set<string>();
  const albums: CatalogAlbum[] = [];
  for (const group of groups) {
    if (typeof group !== "object" || group === null) {
      continue;
    }
    const { id, title } = group as { id?: unknown; title?: unknown };
    if (typeof id !== "string" || !CATALOG_ID.test(id) || typeof title !== "string" || seen.has(id)) {
      continue;
    }
    const artist = joinArtistCredit((group as { "artist-credit"?: unknown })["artist-credit"]);
    if (title.length > MAX_NAME_LENGTH || artist.length > MAX_NAME_LENGTH) {
      continue;
    }
    if ((group as { "primary-type"?: unknown })["primary-type"] === "Single") {
      continue;
    }
    seen.add(id);
    albums.push({
      catalogId: id,
      title,
      artist,
      artistId: joinArtistIds((group as { "artist-credit"?: unknown })["artist-credit"]),
      year: parseYear((group as { "first-release-date"?: unknown })["first-release-date"]),
      coverUrl: `${COVER_URL}/${id}/front-250`,
    });
  }
  return albums;
}

export type MusicBrainzDeps = {
  fetch: typeof fetch;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  userAgent: () => string;
  baseUrl: () => string;
};

function isTimeout(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name;
  return name === "TimeoutError" || name === "AbortError";
}

/** Seconds from a whole-number Retry-After header, clamped to 1..3 s; 1 s when it is missing or not a whole number. */
function retryWaitMs(response: Response): number {
  const header = response.headers.get("Retry-After")?.trim() ?? "";
  if (!/^\d+$/.test(header)) {
    return MIN_RETRY_WAIT_MS;
  }
  return Math.min(Math.max(Number(header) * 1000, MIN_RETRY_WAIT_MS), MAX_RETRY_WAIT_MS);
}

export function createMusicBrainzClient(deps: MusicBrainzDeps) {
  // Earliest time the next request may start. Each request reserves the next slot.
  let nextSlot = 0;

  async function waitForSlot(): Promise<void> {
    const now = deps.now();
    const start = Math.max(now, nextSlot);
    const wait = start - now;
    if (wait > MAX_QUEUE_WAIT_MS) {
      throw new CatalogError("busy", `request queue is ${wait} ms long`);
    }
    nextSlot = start + REQUEST_SPACING_MS;
    if (wait > 0) {
      await deps.sleep(wait);
    }
  }

  async function searchReleaseGroups(catalogQuery: CatalogQuery): Promise<CatalogAlbum[]> {
    const query = buildCatalogQuery(catalogQuery);
    if (query === "") {
      return [];
    }
    const params = new URLSearchParams({
      query,
      fmt: "json",
      limit: String(RESULT_LIMIT),
    });

    let response: Response;
    for (let attempt = 1; ; attempt++) {
      await waitForSlot();
      try {
        response = await deps.fetch(`${deps.baseUrl()}${SEARCH_PATH}?${params}`, {
          headers: { "User-Agent": deps.userAgent(), Accept: "application/json" },
          redirect: "error",
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (error) {
        if (isTimeout(error)) {
          throw new CatalogError("busy", `no answer within ${REQUEST_TIMEOUT_MS} ms`, { cause: error });
        }
        throw new CatalogError("unreachable", "network failure", { cause: error });
      }

      if (response.status !== 503) {
        break;
      }
      if (attempt >= MAX_ATTEMPTS) {
        throw new CatalogError("busy", `MusicBrainz answered 503 ${MAX_ATTEMPTS} times`);
      }
      // MusicBrainz sheds load across all clients; the next try usually gets through.
      await response.body?.cancel();
      await deps.sleep(retryWaitMs(response));
    }

    if (!response.ok) {
      throw new CatalogError("unreachable", `MusicBrainz answered ${response.status}`);
    }

    let body: unknown;
    try {
      body = await readJsonCapped(response, MAX_BODY_BYTES);
    } catch (error) {
      if (isResponseTooLarge(error)) {
        throw new CatalogError("unreachable", "response is over 1 MB", { cause: error });
      }
      if (isTimeout(error)) {
        throw new CatalogError("busy", `no body within ${REQUEST_TIMEOUT_MS} ms`, { cause: error });
      }
      throw new CatalogError("unreachable", "response is not JSON", { cause: error });
    }
    return mapReleaseGroups(body);
  }

  return { searchReleaseGroups };
}
