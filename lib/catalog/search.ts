import "server-only";
import { getConfig } from "../config";
import { CatalogError, MAX_QUERY_LENGTH, createMusicBrainzClient } from "./musicbrainz";
import type { CatalogAlbum, CatalogQuery, SearchResult } from "./types";

const MIN_QUERY_LENGTH = 2;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;

const BUSY_MESSAGE = "The album catalog is busy. Try again in a moment.";
const UNREACHABLE_MESSAGE = "The album catalog couldn't be reached. Try again later.";

export type SearchDeps = {
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  userAgent?: () => string;
  baseUrl?: () => string;
  log?: (message: string, detail: unknown) => void;
};

function normalizeQuery(text: string): string {
  return text.trim().slice(0, MAX_QUERY_LENGTH).toLowerCase().replace(/\s+/g, " ");
}

/** The cache key: the query's kind and its normalized text, so a text and a fields query never share an entry. */
function cacheKey(query: CatalogQuery): string {
  if (query.kind === "text") {
    return `text:${normalizeQuery(query.text)}`;
  }
  return `fields:${JSON.stringify([normalizeQuery(query.title ?? ""), normalizeQuery(query.artist ?? "")])}`;
}

function isTooShort(query: CatalogQuery): boolean {
  const texts = query.kind === "text" ? [query.text] : [query.title ?? "", query.artist ?? ""];
  return Math.max(...texts.map((text) => normalizeQuery(text).length)) < MIN_QUERY_LENGTH;
}

export function createSearchAlbums(deps: SearchDeps = {}) {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((message, detail) => console.error(message, detail));
  const client = createMusicBrainzClient({
    fetch: deps.fetch ?? ((input, init) => fetch(input, init)),
    now,
    sleep: deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
    userAgent: deps.userAgent ?? (() => getConfig().musicbrainzUserAgent),
    baseUrl: deps.baseUrl ?? (() => getConfig().musicbrainzUrl),
  });

  // A Map keeps insertion order, so the first key is the oldest entry.
  const cache = new Map<string, { albums: CatalogAlbum[]; expiresAt: number }>();

  return async function searchAlbums(query: CatalogQuery): Promise<SearchResult> {
    const key = cacheKey(query);
    if (isTooShort(query)) {
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
