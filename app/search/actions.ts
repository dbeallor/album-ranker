"use server";

import { redirect } from "next/navigation";
import { resolveCover } from "@/lib/catalog/server-cover";
import { findAlbumByCatalogId } from "@/lib/db/albums";
import { requireSession } from "@/lib/auth/require-session";
import { getDb } from "@/lib/db/server";
import { addCatalogAlbumToLibrary, validateCatalogAlbum, validateLibraryYear } from "@/lib/library-service";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function addToLibraryAction(formData: FormData): Promise<void> {
  await requireSession();
  const q = field(formData, "q");
  const catalogId = field(formData, "catalogId");
  const db = getDb();
  const redirectBack = (params: Record<string, string>): never => redirect(`/search?${new URLSearchParams({ q, ...params })}`);
  const fail = (message: string): never => redirectBack({ error: message, item: catalogId });

  // Check the form before asking the Cover Art Archive or Deezer for anything.
  const year = validateLibraryYear(field(formData, "year"));
  if (!year.ok) return fail(year.message);
  const checked = validateCatalogAlbum({
    catalogId,
    title: field(formData, "title"),
    artist: field(formData, "artist"),
    artistId: field(formData, "artistId"),
    releaseYear: field(formData, "releaseYear"),
  });
  if (!checked.ok) return fail(checked.message);
  const album = checked.album;

  // The server picks the cover; the browser's `coverUrl` is ignored. An album already stored keeps its cover.
  const coverUrl = findAlbumByCatalogId(db, album.catalogId)
    ? null
    : await resolveCover({ catalogId: album.catalogId, title: album.title, artist: album.artist });
  const result = addCatalogAlbumToLibrary(db, { ...album, coverUrl, year: year.year });
  return result.ok ? redirectBack({ added: catalogId }) : fail(result.message);
}
