// @vitest-environment node
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionToken, SESSION_COOKIE } from "../../lib/auth/session.ts";
import { buildEventsPackage } from "./events-package.ts";

const ROOT = join(import.meta.dirname, "..", "..");
let out: string;

beforeEach(() => {
  out = mkdtempSync(join(tmpdir(), "events-package-"));
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(out, { recursive: true, force: true });
});

describe("buildEventsPackage", () => {
  it("writes the handler and what it imports as JavaScript that runs outside vitest's TypeScript loader", async () => {
    const files = buildEventsPackage(ROOT, join(out, "events"));
    expect(files).toEqual(expect.arrayContaining(["lambda/events.ts", "lib/auth/session.ts", "lib/auth/compare.ts", "lib/client-events/clean.ts"]));
    expect(readdirSync(join(out, "events", "lambda"))).toEqual(["events.js"]);

    const { handler } = (await import(pathToFileURL(join(out, "events", "lambda", "events.js")).href)) as typeof import("../../lambda/events.ts");
    vi.stubEnv("CLIENT_EVENTS", "on");
    vi.stubEnv("ORIGIN_SECRET", "o");
    vi.stubEnv("APP_PASSWORD", "a-long-enough-password");
    vi.stubEnv("DEPLOY_ENV", "staging");
    const token = createSessionToken({ password: "a-long-enough-password", deployEnv: "staging" });
    const event = { requestContext: { http: { method: "POST" } }, headers: { "x-origin-secret": "o" }, cookies: [`${SESSION_COOKIE}=${token}`], body: '{"events":[]}' };
    await expect(handler(event)).resolves.toEqual({ statusCode: 204 });
    await expect(handler({ ...event, cookies: [] })).resolves.toEqual({ statusCode: 401 });
  });
});
