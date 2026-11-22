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
};

const html = { accept: "text/html", "x-origin-secret": ORIGIN };
const staging = { DEPLOY_ENV: "staging", APP_PASSWORD: PASSWORD, ORIGIN_SECRET: ORIGIN };

const cases: Case[] = [
  { name: "a local run with no gate passes, caching left to the app", env: {}, headers: {}, path: "/library", status: 200, noStore: false },
  { name: "/login passes, caching left to the app", env: staging, headers: html, path: "/login", status: 200, noStore: false },
  { name: "a page with no session redirects, never cached", env: staging, headers: html, path: "/library", status: 307, noStore: true },
  { name: "a request with no session and not a page gets 401, never cached", env: staging, headers: { "x-origin-secret": ORIGIN }, path: "/library", status: 401, noStore: true },
  { name: "a request without the origin secret gets 403, never cached", env: staging, headers: { accept: "text/html" }, path: "/library", status: 403, noStore: true },
  { name: "a deployed server with no password gets 503, never cached", env: { DEPLOY_ENV: "staging", ORIGIN_SECRET: ORIGIN }, headers: html, path: "/library", status: 503, noStore: true },
];

describe("proxy", () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each(cases)("$name", ({ env, headers, path, status, noStore }) => {
    for (const name of ["DEPLOY_ENV", "APP_PASSWORD", "ORIGIN_SECRET"]) vi.stubEnv(name, undefined);
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);

    const response = proxy(new NextRequest(`https://app.example.net${path}`, { headers }));

    expect(response.status).toBe(status);
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(response.headers.get("cache-control")).toBe(noStore ? "no-store" : null);
  });
});
