"use server";

import { requireSession } from "@/lib/auth/require-session";
import { getDb } from "@/lib/db/server";
import * as service from "@/lib/matchups-service";

export async function answerMatchup(albumAId: number, albumBId: number, result: "a" | "b" | "tie", avoid: string[]) {
  await requireSession();
  return service.answerMatchup(getDb(), albumAId, albumBId, result, avoid);
}

export async function skipMatchup(albumAId: number, albumBId: number, avoid: string[]) {
  await requireSession();
  return service.skipMatchup(getDb(), albumAId, albumBId, avoid);
}

export async function undoMatchup(avoid: string[]) {
  await requireSession();
  return service.undoMatchup(getDb(), avoid);
}
