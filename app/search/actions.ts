"use server";

import { redirect } from "next/navigation";
import { resolveCover } from "@/lib/catalog/server-cover";
import { findAlbumByCatalogId } from "@/lib/db/albums";
import { requireSession } from "@/lib/auth/require-session";
import { getDb } from "@/lib/db/server";
import { addCatalogAlbumToLibrary } from "@/lib/library-service";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function addToLibraryAction(formData: FormData): Promise<void> {
  await requireSession();
  const q = field(formData, "q");
  const catalogId = field(formData, "catalogId");
  const title = field(formData, "title");
  const artist = field(formData, "artist");
  const db = getDb();
  // The server picks the cover; the browser's `coverUrl` is ignored. An album already stored keeps its cover.
  const coverUrl = findAlbumByCatalogId(db, catalogId.toLowerCase()) ? null : await resolveCover({ catalogId, title, artist });
  const result = addCatalogAlbumToLibrary(db, {
    catalogId,
    title,
    artist,
    artistId: field(formData, "artistId"),
    releaseYear: field(formData, "releaseYear"),
    coverUrl,
    year: field(formData, "year"),
  });
  const params: Record<string, string> = result.ok ? { q, added: catalogId } : { q, error: result.code, item: catalogId };
  redirect(`/search?${new URLSearchParams(params)}`);
}
