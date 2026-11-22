export const MAX_FAILURES = 10;
export const WINDOW_MS = 15 * 60 * 1000;
export const LOCK_MS = 15 * 60 * 1000;

type Entry = { failures: number[]; lockedUntil: number };

export type LoginLimiter = {
  isLocked(ip: string, now?: number): boolean;
  recordFailure(ip: string, now?: number): void;
  recordSuccess(ip: string): void;
};

/** Counts wrong passwords per IP, in memory: a cold start forgets them. */
export function createLoginLimiter(): LoginLimiter {
  const entries = new Map<string, Entry>();

  function sweep(now: number) {
    for (const [ip, entry] of entries) {
      if (entry.lockedUntil <= now && entry.failures.every((at) => at <= now - WINDOW_MS)) entries.delete(ip);
    }
  }

  return {
    isLocked(ip, now = Date.now()) {
      const entry = entries.get(ip);
      return entry !== undefined && entry.lockedUntil > now;
    },
    recordFailure(ip, now = Date.now()) {
      if (entries.size > 1000) sweep(now);
      const entry = entries.get(ip) ?? { failures: [], lockedUntil: 0 };
      entry.failures = entry.failures.filter((at) => at > now - WINDOW_MS);
      entry.failures.push(now);
      if (entry.failures.length >= MAX_FAILURES) {
        entry.lockedUntil = now + LOCK_MS;
        entry.failures = [];
      }
      entries.set(ip, entry);
    },
    recordSuccess(ip) {
      entries.delete(ip);
    },
  };
}

const shared = globalThis as typeof globalThis & { __albumRankerLoginLimiter?: LoginLimiter };

/** One limiter per server process, even when Next.js bundles this module into more than one route. */
export const loginLimiter: LoginLimiter = (shared.__albumRankerLoginLimiter ??= createLoginLimiter());

/** The client IP from CloudFront's `CloudFront-Viewer-Address` (`ip:port`); one shared bucket when it is absent. */
export function clientIp(viewerAddress: string | null): string {
  if (!viewerAddress) return "unknown";
  const colon = viewerAddress.lastIndexOf(":");
  const ip = colon === -1 ? viewerAddress : viewerAddress.slice(0, colon);
  return ip.replace(/^\[|\]$/g, "") || "unknown";
}
