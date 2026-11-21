"use server";

import { getDb } from "@/lib/db/server";
import * as service from "@/lib/matchups-service";

export async function answerMatchup(albumAId: number, albumBId: number, result: "a" | "b" | "tie", avoid: string[]) {
  return service.answerMatchup(getDb(), albumAId, albumBId, result, avoid);
}

export async function skipMatchup(albumAId: number, albumBId: number, avoid: string[]) {
  return service.skipMatchup(getDb(), albumAId, albumBId, avoid);
}

export async function undoMatchup(avoid: string[]) {
  return service.undoMatchup(getDb(), avoid);
}
