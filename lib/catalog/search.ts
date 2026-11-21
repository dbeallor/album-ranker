import "server-only";
import { getConfig } from "../config";
import { CatalogError, createMusicBrainzClient } from "./musicbrainz";
import type { CatalogAlbum, SearchResult } from "./types";

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 200;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;

const BUSY_MESSAGE = "The album catalog is busy. Try again in a moment.";
const UNREACHABLE_MESSAGE = "The album catalog couldn't be reached. Try again later.";

export type SearchDeps = {
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  userAgent?: () => string;
  log?: (message: string, detail: unknown) => void;
};

function normalizeQuery(text: string): string {
  return text.trim().slice(0, MAX_QUERY_LENGTH).toLowerCase().replace(/\s+/g, " ");
}

export function createSearchAlbums(deps: SearchDeps = {}) {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((message, detail) => console.error(message, detail));
  const client = createMusicBrainzClient({
    fetch: deps.fetch ?? ((input, init) => fetch(input, init)),
    now,
    sleep: deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
    userAgent: deps.userAgent ?? (() => getConfig().musicbrainzUserAgent),
  });

  // A Map keeps insertion order, so the first key is the oldest entry.
  const cache = new Map<string, { albums: CatalogAlbum[]; expiresAt: number }>();

  return async function searchAlbums(query: string): Promise<SearchResult> {
    const key = normalizeQuery(query);
    if (key.length < MIN_QUERY_LENGTH) {
      return { ok: true, albums: [] };
    }

    const hit = cache.get(key);
    if (hit) {
      if (hit.expiresAt > now()) {
        return { ok: true, albums: hit.albums };
      }
      cache.delete(key);
    }

    try {
      const albums = await client.searchReleaseGroups(query);
      cache.set(key, { albums, expiresAt: now() + CACHE_TTL_MS });
      if (cache.size > CACHE_MAX_ENTRIES) {
        cache.delete(cache.keys().next().value as string);
      }
      return { ok: true, albums };
    } catch (error) {
      log(`Album search failed for "${key}"`, error);
      const busy = error instanceof CatalogError && error.kind === "busy";
      return { ok: false, message: busy ? BUSY_MESSAGE : UNREACHABLE_MESSAGE };
    }
  };
}

export const searchAlbums = createSearchAlbums();
