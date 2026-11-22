import type { DatabaseSync } from "node:sqlite";
import { isAllowedCoverUrl } from "./catalog/cover-art";
import { createAlbum, deleteAlbum, findAlbumByCatalogId, getAlbum } from "./db/albums";
import { addToLibrary, getLibraryEntry } from "./db/library";
import { countMatchupsForAlbum } from "./db/matchups";
import { transaction } from "./db/transaction";

/** A value as it arrives from a form: text, a number, or nothing. */
type Raw = string | number | null | undefined;

export type AddCatalogAlbumInput = {
  catalogId: Raw;
  title: Raw;
  artist: Raw;
  /** The catalog's artist id, shared by every album of that artist. Empty or missing for a credit without one. */
  artistId: Raw;
  /** The catalog's year for the album, stored as is. Empty or missing when the catalog has none. */
  releaseYear: Raw;
  coverUrl: Raw;
  /** The year to file the album under in the library. */
  year: Raw;
};

export type AddCatalogAlbumResult = { ok: true; added: boolean } | { ok: false; message: string };

export type RemoveFromLibraryResult =
  | { ok: true; title: string; matchups: number }
  | { ok: false; message: string; stale?: true; matchups?: number };

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const CATALOG_ID = new RegExp(`^${UUID}$`, "i");
const ARTIST_ID = new RegExp(`^${UUID}(\\+${UUID})*$`, "i");
const WHOLE_NUMBER = /^\d+$/;
const MAX_TEXT = 300;
const MAX_ARTIST_ID = 400;
const YEAR_MESSAGE = "Enter a year from 1900 to 2100.";

function wholeNumber(value: Raw): number | undefined {
  if (typeof value === "number") return Number.isSafeInteger(value) ? value : undefined;
  if (typeof value === "string" && WHOLE_NUMBER.test(value.trim())) {
    const parsed = Number(value.trim());
    return Number.isSafeInteger(parsed) ? parsed : undefined;
  }
  return undefined;
}

function text(value: Raw): string {
  return typeof value === "string" ? value.trim() : "";
}

function blank(value: Raw): boolean {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
}

/**
 * Adds a catalog album to the library under `year`, reusing the album row if one has this catalog id.
 * The browser can send anything, so every field is checked here. An album already in the library is left
 * as it is (its year included) and reported as `added: false`.
 */
export function addCatalogAlbumToLibrary(db: DatabaseSync, input: AddCatalogAlbumInput): AddCatalogAlbumResult {
  const year = wholeNumber(input.year);
  if (year === undefined || year < 1900 || year > 2100) return { ok: false, message: YEAR_MESSAGE };

  const rawCatalogId = text(input.catalogId);
  if (!CATALOG_ID.test(rawCatalogId)) return { ok: false, message: "That album's catalog id isn't valid." };
  const catalogId = rawCatalogId.toLowerCase();

  const rawArtistId = text(input.artistId);
  if (rawArtistId.length > MAX_ARTIST_ID || (rawArtistId !== "" && !ARTIST_ID.test(rawArtistId))) {
    return { ok: false, message: "That album's artist id isn't valid." };
  }
  const artistId = rawArtistId.toLowerCase();

  const title = text(input.title);
  const artist = text(input.artist);
  if (title === "" || title.length > MAX_TEXT) return { ok: false, message: "That album's title isn't valid." };
  if (artist === "" || artist.length > MAX_TEXT) return { ok: false, message: "That album's artist isn't valid." };

  const coverUrl = text(input.coverUrl);
  if (coverUrl !== "" && !isAllowedCoverUrl(coverUrl)) return { ok: false, message: "That album's cover isn't valid." };

  const releaseYear = blank(input.releaseYear) ? null : wholeNumber(input.releaseYear);
  if (releaseYear === undefined || (releaseYear !== null && (releaseYear < 1 || releaseYear > 2100))) return { ok: false, message: "That album's release year isn't valid." };

  return transaction(db, () => {
    const existing = findAlbumByCatalogId(db, catalogId);
    if (existing && getLibraryEntry(db, existing.id)) return { ok: true, added: false };

    const album =
      existing ??
      createAlbum(db, {
        title,
        artist: { name: artist, catalogId: artistId || null },
        catalogId,
        releaseYear,
        coverUrl: coverUrl || null,
      });
    addToLibrary(db, { albumId: album.id, year });
    return { ok: true, added: true };
  });
}

/**
 * Deletes a library album with its matchups, provided it still has the `expectedMatchups` the user was
 * shown. A different count deletes nothing and reports the current one.
 */
export function removeFromLibrary(db: DatabaseSync, albumId: Raw, expectedMatchups: Raw): RemoveFromLibraryResult {
  return transaction(db, () => {
    const id = wholeNumber(albumId);
    const album = id === undefined ? undefined : getAlbum(db, id);
    if (id === undefined || !album || !getLibraryEntry(db, id)) {
      return { ok: false, message: "That album isn't in your library." };
    }

    const matchups = countMatchupsForAlbum(db, id);
    if (wholeNumber(expectedMatchups) !== matchups) {
      return {
        ok: false,
        stale: true,
        matchups,
        message: `This album now has ${matchups} ${matchups === 1 ? "matchup" : "matchups"}. Check and confirm again.`,
      };
    }

    deleteAlbum(db, id);
    return { ok: true, title: album.title, matchups };
  });
}
