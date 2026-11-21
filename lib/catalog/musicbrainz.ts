import "server-only";
import type { CatalogAlbum } from "./types";

const SEARCH_URL = "https://musicbrainz.org/ws/2/release-group";
const COVER_URL = "https://coverartarchive.org/release-group";
export const MAX_QUERY_LENGTH = 200;
const RESULT_LIMIT = 25;
const REQUEST_SPACING_MS = 1100;
const MAX_QUEUE_WAIT_MS = 5000;
const REQUEST_TIMEOUT_MS = 8000;

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

/** Matches each word against the album title or the artist name. */
export function buildQuery(text: string): string {
  return text
    .trim()
    .slice(0, MAX_QUERY_LENGTH)
    .split(/\s+/)
    .filter((word) => word !== "")
    .map(escapeWord)
    .map((word) => `(releasegroup:${word} OR artist:${word})`)
    .join(" AND ");
}

type ArtistCredit = { name?: unknown; joinphrase?: unknown; artist?: { id?: unknown; name?: unknown } };

function joinArtistCredit(credit: unknown): string {
  if (!Array.isArray(credit)) {
    return "";
  }
  return (credit as ArtistCredit[])
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
  const ids = (credit as ArtistCredit[]).flatMap((part) =>
    typeof part.artist?.id === "string" && part.artist.id !== "" ? [part.artist.id] : [],
  );
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
    if (typeof id !== "string" || typeof title !== "string" || seen.has(id)) {
      continue;
    }
    if ((group as { "primary-type"?: unknown })["primary-type"] === "Single") {
      continue;
    }
    seen.add(id);
    albums.push({
      catalogId: id,
      title,
      artist: joinArtistCredit((group as { "artist-credit"?: unknown })["artist-credit"]),
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
};

function isTimeout(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name;
  return name === "TimeoutError" || name === "AbortError";
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

  async function searchReleaseGroups(text: string): Promise<CatalogAlbum[]> {
    const params = new URLSearchParams({
      query: buildQuery(text),
      fmt: "json",
      limit: String(RESULT_LIMIT),
    });

    await waitForSlot();

    let response: Response;
    try {
      response = await deps.fetch(`${SEARCH_URL}?${params}`, {
        headers: { "User-Agent": deps.userAgent(), Accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      if (isTimeout(error)) {
        throw new CatalogError("busy", `no answer within ${REQUEST_TIMEOUT_MS} ms`, { cause: error });
      }
      throw new CatalogError("unreachable", "network failure", { cause: error });
    }

    if (response.status === 503) {
      throw new CatalogError("busy", "MusicBrainz answered 503");
    }
    if (!response.ok) {
      throw new CatalogError("unreachable", `MusicBrainz answered ${response.status}`);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      if (isTimeout(error)) {
        throw new CatalogError("busy", `no body within ${REQUEST_TIMEOUT_MS} ms`, { cause: error });
      }
      throw new CatalogError("unreachable", "response is not JSON", { cause: error });
    }
    return mapReleaseGroups(body);
  }

  return { searchReleaseGroups };
}
