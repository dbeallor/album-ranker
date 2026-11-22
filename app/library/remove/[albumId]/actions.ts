"use server";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/require-session";
import { getDb } from "@/lib/db/server";
import { removeFromLibrary } from "@/lib/library-service";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function removeAlbumAction(formData: FormData): Promise<void> {
  await requireSession();
  const albumId = field(formData, "albumId");
  const result = removeFromLibrary(getDb(), albumId, field(formData, "matchups"));
  if (result.ok) {
    redirect(`/library?${new URLSearchParams({ removed: result.title, matchups: String(result.matchups) })}`);
  }
  if (result.stale) {
    redirect(`/library/remove/${encodeURIComponent(albumId)}?${new URLSearchParams({ error: result.message })}`);
  }
  redirect("/library");
}
