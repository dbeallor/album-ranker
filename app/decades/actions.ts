"use server";

import { getDb } from "@/lib/db/server";
import * as service from "@/lib/decade-service";

export async function saveList(decade: number, albumIds: number[]) {
  return service.saveDecadeList(getDb(), decade, albumIds);
}

export async function accept(decade: number, albumIds: number[]) {
  return service.acceptSuggestion(getDb(), decade, albumIds);
}
