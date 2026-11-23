import { createHmac } from "node:crypto";
import type { DeployEnv } from "../config.ts";
import { safeEqual } from "./compare.ts";

export const SESSION_COOKIE = "album_session";
export const SESSION_DAYS = 90;
export const SESSION_MAX_AGE_SECONDS = SESSION_DAYS * 24 * 60 * 60;

/** What signs a session: the password and the environment, so changing either signs every device out. */
export type SessionSecret = { password: string; deployEnv: DeployEnv | null };

function sign(expiry: string, { password, deployEnv }: SessionSecret): string {
  const key = createHmac("sha256", password).update(`album-ranker-session:${deployEnv ?? "local"}`).digest();
  return createHmac("sha256", key).update(expiry).digest("base64url");
}

/** `<expiry in ms>.<signature>`, valid for 90 days from `now`. */
export function createSessionToken(secret: SessionSecret, now: number = Date.now()): string {
  const expiry = String(now + SESSION_MAX_AGE_SECONDS * 1000);
  return `${expiry}.${sign(expiry, secret)}`;
}

export function verifySessionToken(token: string | undefined, secret: SessionSecret, now: number = Date.now()): boolean {
  const match = token?.match(/^(\d{1,16})\.([A-Za-z0-9_-]{43})$/);
  if (!match) return false;
  const [, expiry, signature] = match;
  return safeEqual(signature, sign(expiry, secret)) && Number(expiry) > now;
}
