import { describe, expect, it } from "vitest";
import { clientIp, createLoginLimiter, LOCK_MS, MAX_FAILURES, WINDOW_MS } from "./login-limiter";

const START = 1_800_000_000_000;

function fail(limiter: ReturnType<typeof createLoginLimiter>, ip: string, times: number, at = START) {
  for (let i = 0; i < times; i++) limiter.recordFailure(ip, at + i);
}

const cases: { name: string; run: (limiter: ReturnType<typeof createLoginLimiter>) => boolean; expected: boolean }[] = [
  { name: "a new IP is not locked", run: (l) => l.isLocked("1.1.1.1", START), expected: false },
  { name: "the 9th failure does not lock", run: (l) => (fail(l, "1.1.1.1", MAX_FAILURES - 1), l.isLocked("1.1.1.1", START + 100)), expected: false },
  { name: "the 10th failure locks, so the 11th try is refused", run: (l) => (fail(l, "1.1.1.1", MAX_FAILURES), l.isLocked("1.1.1.1", START + 100)), expected: true },
  { name: "the lock holds just before 15 minutes pass", run: (l) => (fail(l, "1.1.1.1", MAX_FAILURES), l.isLocked("1.1.1.1", START + MAX_FAILURES - 2 + LOCK_MS)), expected: true },
  { name: "the lock lifts after 15 minutes", run: (l) => (fail(l, "1.1.1.1", MAX_FAILURES), l.isLocked("1.1.1.1", START + MAX_FAILURES + LOCK_MS)), expected: false },
  { name: "another IP is counted apart", run: (l) => (fail(l, "1.1.1.1", MAX_FAILURES), l.isLocked("2.2.2.2", START + 100)), expected: false },
  { name: "failures spread over more than 15 minutes don't lock", run: (l) => {
      for (let i = 0; i < MAX_FAILURES; i++) l.recordFailure("1.1.1.1", START + i * (WINDOW_MS / 5));
      return l.isLocked("1.1.1.1", START + MAX_FAILURES * (WINDOW_MS / 5));
    }, expected: false },
  { name: "a right password clears the count", run: (l) => {
      fail(l, "1.1.1.1", MAX_FAILURES - 1);
      l.recordSuccess("1.1.1.1");
      l.recordFailure("1.1.1.1", START + 100);
      return l.isLocked("1.1.1.1", START + 101);
    }, expected: false },
];

describe("login limiter", () => {
  it.each(cases)("$name", ({ run, expected }) => {
    expect(run(createLoginLimiter())).toBe(expected);
  });
});

describe("clientIp", () => {
  it.each([
    { name: "an IPv4 address", header: "203.0.113.7", expected: "203.0.113.7" },
    { name: "an IPv6 address", header: "2001:db8::1", expected: "2001:db8::1" },
    { name: "an address with spaces around it", header: " 203.0.113.7 ", expected: "203.0.113.7" },
    { name: "no header", header: null, expected: "unknown" },
    { name: "an empty header", header: "", expected: "unknown" },
  ])("$name", ({ header, expected }) => {
    expect(clientIp(header)).toBe(expected);
  });
});
