"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/server";
import { addCatalogAlbumToLibrary } from "@/lib/library-service";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function addToLibraryAction(formData: FormData): Promise<void> {
  const q = field(formData, "q");
  const catalogId = field(formData, "catalogId");
  const result = addCatalogAlbumToLibrary(getDb(), {
    catalogId,
    title: field(formData, "title"),
    artist: field(formData, "artist"),
    artistId: field(formData, "artistId"),
    releaseYear: field(formData, "releaseYear"),
    coverUrl: field(formData, "coverUrl"),
    year: field(formData, "year"),
  });
  const params: Record<string, string> = result.ok ? { q, added: catalogId } : { q, error: result.message, item: catalogId };
  redirect(`/search?${new URLSearchParams(params)}`);
}
