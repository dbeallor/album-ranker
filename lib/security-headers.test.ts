// @vitest-environment node
import { describe, expect, it } from "vitest";
import { securityHeaders } from "./security-headers";

const DIRECTIVES = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https://coverartarchive.org https://archive.org https://*.archive.org https://cdn-images.dzcdn.net https://e-cdns-images.dzcdn.net",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
];

describe("securityHeaders", () => {
  it.each([
    { name: "production", development: false, scriptSrc: "script-src 'self' 'unsafe-inline'" },
    { name: "development", development: true, scriptSrc: "script-src 'self' 'unsafe-inline' 'unsafe-eval'" },
  ])("$name", ({ development, scriptSrc }) => {
    const headers = Object.fromEntries(securityHeaders({ development }).map(({ key, value }) => [key, value]));
    const csp = headers["Content-Security-Policy"].split("; ");

    expect(csp).toEqual([DIRECTIVES[0], scriptSrc, ...DIRECTIVES.slice(1)]);
    expect(headers["Content-Security-Policy"].includes("'unsafe-eval'")).toBe(development);
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Referrer-Policy"]).toBe("same-origin");
    expect(Object.keys(headers)).not.toContain("Strict-Transport-Security");
    expect(Object.keys(headers)).toHaveLength(4);
  });
});
