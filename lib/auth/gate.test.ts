// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { GateConfig } from "../config";
import { gateDecision, type GateDecision, type GateInput } from "./gate";
import { createSessionToken } from "./session";

const PASSWORD = "correct horse battery";
const ORIGIN = "origin-secret-value";
const NOW = 1_800_000_000_000;

const staging: GateConfig = { deployEnv: "staging", appPassword: PASSWORD, originSecret: ORIGIN };
const local: GateConfig = { deployEnv: null, appPassword: PASSWORD, originSecret: null };
const validCookie = createSessionToken({ password: PASSWORD, deployEnv: "staging" }, NOW);
const validLocalCookie = createSessionToken({ password: PASSWORD, deployEnv: null }, NOW);

const page: Omit<GateInput, "gate"> = {
  pathname: "/library",
  search: "?sort=year",
  method: "GET",
  accept: "text/html,application/xhtml+xml",
  sessionCookie: undefined,
  originHeader: ORIGIN,
  now: NOW,
};

const cases: { name: string; gate: GateConfig; request: Partial<GateInput>; expected: GateDecision }[] = [
  { name: "/login passes without a cookie", gate: staging, request: { pathname: "/login" }, expected: { action: "pass" } },
  { name: "a page with no cookie redirects to login, keeping the path", gate: staging, request: {}, expected: { action: "redirect", location: "/login?next=%2Flibrary%3Fsort%3Dyear" } },
  { name: "a page with a bad cookie redirects", gate: staging, request: { sessionCookie: "garbage" }, expected: { action: "redirect", location: "/login?next=%2Flibrary%3Fsort%3Dyear" } },
  { name: "a server action (POST) with no cookie gets 401", gate: staging, request: { method: "POST", accept: "text/x-component" }, expected: { action: "deny", status: 401 } },
  { name: "a data request that doesn't ask for HTML gets 401", gate: staging, request: { accept: "*/*" }, expected: { action: "deny", status: 401 } },
  { name: "a valid cookie passes", gate: staging, request: { sessionCookie: validCookie }, expected: { action: "pass" } },
  { name: "a cookie signed for another environment gets the redirect", gate: staging, request: { sessionCookie: validLocalCookie }, expected: { action: "redirect", location: "/login?next=%2Flibrary%3Fsort%3Dyear" } },
  { name: "deployed with no password gets 503", gate: { ...staging, appPassword: null }, request: { sessionCookie: validCookie }, expected: { action: "deny", status: 503 } },
  { name: "deployed with a short password gets 503", gate: { ...staging, appPassword: "short" }, request: {}, expected: { action: "deny", status: 503 } },
  { name: "deployed with no password gets 503 on /login too", gate: { ...staging, appPassword: null }, request: { pathname: "/login" }, expected: { action: "deny", status: 503 } },
  { name: "deployed without the origin header gets 403", gate: staging, request: { originHeader: null, sessionCookie: validCookie }, expected: { action: "deny", status: 403 } },
  { name: "deployed with the wrong origin header gets 403", gate: staging, request: { originHeader: "nope", sessionCookie: validCookie }, expected: { action: "deny", status: 403 } },
  { name: "deployed with no origin secret configured gets 403", gate: { ...staging, originSecret: null }, request: { originHeader: "", sessionCookie: validCookie }, expected: { action: "deny", status: 403 } },
  { name: "deployed /login without the origin header gets 403", gate: staging, request: { pathname: "/login", originHeader: null }, expected: { action: "deny", status: 403 } },
  { name: "local without a password passes", gate: { deployEnv: null, appPassword: null, originSecret: null }, request: { originHeader: null }, expected: { action: "pass" } },
  { name: "local with a password and no cookie redirects", gate: local, request: { originHeader: null }, expected: { action: "redirect", location: "/login?next=%2Flibrary%3Fsort%3Dyear" } },
  { name: "local with a password and a valid cookie passes, with no origin header", gate: local, request: { originHeader: null, sessionCookie: validLocalCookie }, expected: { action: "pass" } },
];

describe("gateDecision", () => {
  it.each(cases)("$name", ({ gate, request, expected }) => {
    expect(gateDecision({ ...page, ...request, gate })).toEqual(expected);
  });
});
