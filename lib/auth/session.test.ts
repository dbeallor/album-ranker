// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createSessionToken, SESSION_MAX_AGE_SECONDS, verifySessionToken, type SessionSecret } from "./session";

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const secret: SessionSecret = { password: "correct horse battery", deployEnv: "staging" };

function tokenWith(change: (token: string) => string, signedWith: SessionSecret = secret, at = NOW): string {
  return change(createSessionToken(signedWith, at));
}

const cases: { name: string; token: string | undefined; now: number; expected: boolean }[] = [
  { name: "a fresh token passes", token: createSessionToken(secret, NOW), now: NOW, expected: true },
  { name: "a token still passes 89 days later", token: createSessionToken(secret, NOW), now: NOW + 89 * DAY, expected: true },
  { name: "a token fails after 90 days", token: createSessionToken(secret, NOW), now: NOW + SESSION_MAX_AGE_SECONDS * 1000, expected: false },
  { name: "a tampered expiry fails", token: tokenWith((token) => `${Number(token.split(".")[0]) + DAY}.${token.split(".")[1]}`), now: NOW, expected: false },
  { name: "a tampered signature fails", token: tokenWith((token) => token.slice(0, -1) + (token.endsWith("A") ? "B" : "A")), now: NOW, expected: false },
  { name: "a token with no signature fails", token: tokenWith((token) => token.split(".")[0]), now: NOW, expected: false },
  { name: "a token with extra parts fails", token: tokenWith((token) => `${token}.x`), now: NOW, expected: false },
  { name: "garbage fails", token: "not a token", now: NOW, expected: false },
  { name: "an empty token fails", token: "", now: NOW, expected: false },
  { name: "a missing token fails", token: undefined, now: NOW, expected: false },
  { name: "a token signed with another password fails", token: createSessionToken({ ...secret, password: "another password!" }, NOW), now: NOW, expected: false },
  { name: "a token signed for another environment fails", token: createSessionToken({ ...secret, deployEnv: "production" }, NOW), now: NOW, expected: false },
  { name: "a token signed for a local run fails on a deployed one", token: createSessionToken({ ...secret, deployEnv: null }, NOW), now: NOW, expected: false },
];

describe("session token", () => {
  it.each(cases)("$name", ({ token, now, expected }) => {
    expect(verifySessionToken(token, secret, now)).toBe(expected);
  });
});
