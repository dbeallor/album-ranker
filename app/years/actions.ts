"use server";

import { redirect } from "next/navigation";
import { searchAlbums } from "@/lib/catalog/search";
import type { CatalogAlbum, SearchResult } from "@/lib/catalog/types";
import { getDb } from "@/lib/db/server";
import * as service from "@/lib/year-service";
import type { Area, Placements } from "@/lib/year-placements";

export async function saveYear(year: number, placements: Placements) {
  return service.saveYear(getDb(), year, placements);
}

export async function searchCatalog(query: string): Promise<SearchResult> {
  return searchAlbums(typeof query === "string" ? query : "");
}

export async function addFromCatalog(year: number, album: CatalogAlbum, area: Area, move: boolean) {
  return service.addFromCatalog(getDb(), year, album, area, move);
}

export async function addManualAlbum(
  year: number,
  input: { title: string; artist: string; releaseYear: number | null; area: Area },
) {
  return service.addManual(getDb(), year, input);
}

/** The "Go to year" form on /years. Opens any year in range, including an empty one. */
export async function goToYear(formData: FormData) {
  const year = Number(formData.get("year"));
  redirect(service.isValidYear(year) ? `/years/${year}` : "/years");
}
