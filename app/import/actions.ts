"use server";

import { redirect } from "next/navigation";
import { getAlbum } from "@/lib/db/albums";
import { getDb } from "@/lib/db/server";
import type { CatalogCandidate } from "@/lib/db/types";
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
    coverUrl: field(formData, "coverUrl") || null,
  };
}

function resolve(itemId: number, choice: ResolveChoice): never {
  const db = getDb();
  const result = resolveReviewItem(db, itemId, choice);
  if (!result.ok) return fail(itemId, result.message);
  const params: Record<string, string> = {};
  const title = getAlbum(db, result.albumId)?.title ?? "The album";
  if (result.removedDecadeEntries.length > 0) {
    params.removed = String(result.removedDecadeEntries.length);
    params.album = title;
  }
  if (result.decade?.status === "full") params.full = title;
  return back(params);
}

/** Use this album (a candidate or a search result), or Move it here when `moveHere` is set. */
export async function chooseAlbumAction(formData: FormData): Promise<void> {
  const itemId = whole(field(formData, "itemId"));
  if (itemId === null) return fail(null, "That review item could not be found.");
  const album = candidateFrom(formData);
  if (!album) return fail(itemId, "That album is missing its catalog details.");
  return resolve(itemId, { kind: "catalog", album, moveHere: field(formData, "moveHere") === "1" });
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
  if (!result.ok) return fail(itemId, result.message);
  return back({});
}
