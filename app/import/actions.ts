"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { resolveCover } from "@/lib/catalog/server-cover";
import { findAlbumByCatalogId } from "@/lib/db/albums";
import { getImportReviewItem, listImportReviewItems } from "@/lib/db/import-review";
import { getDb } from "@/lib/db/server";
import type { CatalogCandidate } from "@/lib/db/types";
import { nextOpenItemId } from "@/lib/import/review-order";
import { resolveReviewItem, skipReviewItem, type ResolveChoice } from "@/lib/import/resolve";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function whole(value: string): number | null {
  return /^\d+$/.test(value) ? Number(value) : null;
}

/** Sends the browser back to the review page; the message shows next to the item it is about. */
function back(params: Record<string, string>): never {
  redirect(`/import?${new URLSearchParams(params)}`);
}

/** How an item came to be handled, for the page's message: `already` (an earlier click did it), `moved` (an album that was in the library moved to the sheet's year). */
type Handled = { already?: boolean; moved?: boolean };

/**
 * An item is handled (by this click, or by an earlier one): refresh the page and land on a URL that differs from the
 * one the click came from, so the router shows the new state. The fragment scrolls to the open item that now sits
 * where this one was, if any are left.
 */
function done(itemId: number, { already = false, moved = false }: Handled = {}): never {
  refresh();
  const db = getDb();
  const handled = getImportReviewItem(db, itemId);
  const next = handled ? nextOpenItemId(listImportReviewItems(db), handled) : null;
  const params = new URLSearchParams({ done: String(itemId) });
  if (already) params.set("already", "1");
  if (moved) params.set("moved", "1");
  redirect(`/import?${params}${next === null ? "" : `#item-${next}`}`);
}

function fail(itemId: number | null, message: string): never {
  return back(itemId === null ? { error: message } : { error: message, item: String(itemId) });
}

function candidateFrom(formData: FormData): CatalogCandidate | null {
  const catalogId = field(formData, "catalogId");
  const title = field(formData, "title");
  const artist = field(formData, "artist");
  if (catalogId === "" || title === "" || artist === "") return null;
  return {
    catalogId,
    title,
    artist,
    artistId: field(formData, "artistId") || null,
    releaseYear: whole(field(formData, "releaseYear")),
    // Not read from the form: the server picks the cover (see `withCover`).
    coverUrl: null,
  };
}

/** Fills in the album's cover, unless the album is stored already (it keeps its own). */
async function withCover(album: CatalogCandidate): Promise<CatalogCandidate> {
  if (findAlbumByCatalogId(getDb(), album.catalogId.toLowerCase())) return album;
  return { ...album, coverUrl: await resolveCover({ catalogId: album.catalogId, title: album.title, artist: album.artist }) };
}

function resolve(itemId: number, choice: ResolveChoice): never {
  const result = resolveReviewItem(getDb(), itemId, choice);
  if (result.ok) return done(itemId, { moved: result.movedFromYear !== null });
  // A second click on an item the first click already handled is not an error.
  if (result.code === "not_open") return done(itemId, { already: true });
  return fail(itemId, result.message);
}

/** Use this album (a candidate or a search result), or Move it here when `moveHere` is set. */
export async function chooseAlbumAction(formData: FormData): Promise<void> {
  const itemId = whole(field(formData, "itemId"));
  if (itemId === null) return fail(null, "That review item could not be found.");
  const album = candidateFrom(formData);
  if (!album) return fail(itemId, "That album is missing its catalog details.");
  return resolve(itemId, { kind: "catalog", album: await withCover(album), moveHere: field(formData, "moveHere") === "1" });
}

export async function keepManualAction(formData: FormData): Promise<void> {
  const itemId = whole(field(formData, "itemId"));
  if (itemId === null) return fail(null, "That review item could not be found.");
  return resolve(itemId, { kind: "manual" });
}

export async function skipAction(formData: FormData): Promise<void> {
  const itemId = whole(field(formData, "itemId"));
  if (itemId === null) return fail(null, "That review item could not be found.");
  const result = skipReviewItem(getDb(), itemId);
  if (result.ok) return done(itemId);
  if (result.code === "not_open") return done(itemId, { already: true });
  return fail(itemId, result.message);
}
