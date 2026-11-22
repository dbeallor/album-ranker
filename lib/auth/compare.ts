import { createHash, timingSafeEqual } from "node:crypto";

/** Compares two strings in constant time: both are hashed to fixed-length digests first, so length doesn't leak. */
export function safeEqual(a: string, b: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(a), digest(b));
}
