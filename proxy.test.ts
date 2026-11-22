// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { proxy } from "./proxy";

const PASSWORD = "correct horse battery";
const ORIGIN = "origin-secret-value";

type Case = {
  name: string;
  env: Record<string, string>;
  headers: Record<string, string>;
  path: string;
  status: number;
  noStore: boolean;
  /** The log line the proxy writes, or null for none. */
  log: { level: "warn" | "error"; line: string } | null;
};

const html = { accept: "text/html", "x-origin-secret": ORIGIN };
const staging = { DEPLOY_ENV: "staging", APP_PASSWORD: PASSWORD, ORIGIN_SECRET: ORIGIN };

const cases: Case[] = [
  { name: "a local run with no gate passes, caching left to the app", env: {}, headers: {}, path: "/library", status: 200, noStore: false, log: null },
  { name: "/login passes, caching left to the app", env: staging, headers: html, path: "/login", status: 200, noStore: false, log: null },
  { name: "a page with no session redirects, never cached", env: staging, headers: html, path: "/library", status: 307, noStore: true, log: null },
  { name: "a request with no session and not a page gets 401, never cached", env: staging, headers: { "x-origin-secret": ORIGIN }, path: "/library", status: 401, noStore: true, log: null },
  { name: "a request without the origin secret gets 403, never cached", env: staging, headers: { accept: "text/html" }, path: "/library", status: 403, noStore: true, log: { level: "warn", line: '[gate] {"event":"origin-denied","path":"/library"}' } },
  { name: "a deployed server with no password gets 503, never cached", env: { DEPLOY_ENV: "staging", ORIGIN_SECRET: ORIGIN }, headers: html, path: "/library", status: 503, noStore: true, log: { level: "error", line: '[gate] {"event":"gate-misconfigured","reason":"APP_PASSWORD is not set. A staging environment needs a password of at least 12 characters."}' } },
];

describe("proxy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each(cases)("$name", ({ env, headers, path, status, noStore, log }) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const name of ["DEPLOY_ENV", "APP_PASSWORD", "ORIGIN_SECRET"]) vi.stubEnv(name, undefined);
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);

    const response = proxy(new NextRequest(`https://app.example.net${path}`, { headers }));

    expect(response.status).toBe(status);
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(response.headers.get("cache-control")).toBe(noStore ? "no-store" : null);
    expect(warn.mock.calls.map(([line]) => line)).toEqual(log?.level === "warn" ? [log.line] : []);
    expect(error.mock.calls.map(([line]) => line)).toEqual(log?.level === "error" ? [log.line] : []);
  });
});
