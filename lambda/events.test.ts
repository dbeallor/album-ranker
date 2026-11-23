// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createSessionToken, SESSION_COOKIE } from "../lib/auth/session.ts";
import { handleEvents, type EventsEnv, type EventsRequest } from "./events.ts";

const ENV: EventsEnv = { CLIENT_EVENTS: "on", ORIGIN_SECRET: "origin-secret-value", APP_PASSWORD: "a-long-enough-password", DEPLOY_ENV: "staging" };
const TOKEN = createSessionToken({ password: "a-long-enough-password", deployEnv: "staging" });
const NOW = new Date("2026-11-23T12:00:00.000Z");

const page = { type: "page", t: "2026-11-23T11:59:00.000Z", seq: 1, session: "tab-1", path: "/matchup", vw: 390 };
const click = { type: "click", t: "2026-11-23T11:59:05.000Z", seq: 2, session: "tab-1", tag: "button", name: "pick-a" };
const batch = (events: unknown[]) => JSON.stringify({ events });

function request({ headers, ...rest }: Partial<EventsRequest> = {}): EventsRequest {
  return {
    requestContext: { http: { method: "POST" } },
    cookies: [`${SESSION_COOKIE}=${TOKEN}`],
    body: batch([page]),
    ...rest,
    headers: { "x-origin-secret": "origin-secret-value", "sec-fetch-site": "same-origin", "content-type": "application/json", "user-agent": "secret-agent/1.0", "x-forwarded-for": "203.0.113.9", ...headers },
  };
}

function run(event: EventsRequest, env: EventsEnv = ENV) {
  const lines: string[] = [];
  const response = handleEvents(event, env, (line) => lines.push(line), NOW);
  return { response, lines };
}

describe("handleEvents answers", () => {
  const rows: Array<{ name: string; event: EventsRequest; env?: EventsEnv; status: number; line: string | null }> = [
    { name: "404 and silence when switched off", event: request(), env: { ...ENV, CLIENT_EVENTS: "off" }, status: 404, line: null },
    { name: "403 for a wrong origin secret", event: request({ headers: { "x-origin-secret": "nope" } }), status: 403, line: '[client-event-refused] {"status":403,"reason":"origin-secret"}' },
    { name: "403 for a missing origin secret header", event: { ...request(), headers: {} }, status: 403, line: '[client-event-refused] {"status":403,"reason":"origin-secret"}' },
    { name: "403 when ORIGIN_SECRET is not set", event: request(), env: { ...ENV, ORIGIN_SECRET: undefined }, status: 403, line: '[client-event-refused] {"status":403,"reason":"origin-secret"}' },
    { name: "405 for a GET", event: request({ requestContext: { http: { method: "GET" } } }), status: 405, line: '[client-event-refused] {"status":405,"reason":"method"}' },
    { name: "403 for a cross-site request", event: request({ headers: { "sec-fetch-site": "cross-site" } }), status: 403, line: '[client-event-refused] {"status":403,"reason":"cross-site"}' },
    { name: "403 for a same-site (not same-origin) request", event: request({ headers: { "sec-fetch-site": "same-site" } }), status: 403, line: '[client-event-refused] {"status":403,"reason":"cross-site"}' },
    { name: "401 without a cookie", event: request({ cookies: [] }), status: 401, line: '[client-event-refused] {"status":401,"reason":"session"}' },
    { name: "401 for a cookie that does not verify", event: request({ cookies: [`${SESSION_COOKIE}=${TOKEN.slice(0, -1)}A`] }), status: 401, line: '[client-event-refused] {"status":401,"reason":"session"}' },
    { name: "401 for a cookie signed for the other environment", event: request({ cookies: [`${SESSION_COOKIE}=${createSessionToken({ password: "a-long-enough-password", deployEnv: "production" })}`] }), status: 401, line: '[client-event-refused] {"status":401,"reason":"session"}' },
    { name: "401 when APP_PASSWORD is not set", event: request(), env: { ...ENV, APP_PASSWORD: undefined }, status: 401, line: '[client-event-refused] {"status":401,"reason":"session"}' },
    { name: "413 for a body over 32 KB", event: request({ body: batch([{ ...page, path: "/" + "a".repeat(40_000) }]) }), status: 413, line: '[client-event-refused] {"status":413,"reason":"too-large"}' },
    { name: "400 for invalid JSON", event: request({ body: "{not json" }), status: 400, line: '[client-event-refused] {"status":400,"reason":"bad-body"}' },
    { name: "400 for an empty body", event: { ...request(), body: undefined }, status: 400, line: '[client-event-refused] {"status":400,"reason":"bad-body"}' },
    { name: "400 for a body that is not an events object", event: request({ body: JSON.stringify([page]) }), status: 400, line: '[client-event-refused] {"status":400,"reason":"bad-body"}' },
    { name: "400 for more than 100 events", event: request({ body: batch(Array.from({ length: 101 }, () => page)) }), status: 400, line: '[client-event-refused] {"status":400,"reason":"bad-body"}' },
    { name: "204 for an empty batch", event: request({ body: batch([]) }), status: 204, line: null },
  ];

  it.each(rows)("$name", ({ event, env, status, line }) => {
    const { response, lines } = run(event, env);
    expect(response).toEqual({ statusCode: status });
    expect(lines).toEqual(line === null ? [] : [line]);
  });

  it("takes the cookie from the cookie header too", () => {
    const { response } = run({ ...request({ cookies: undefined }), headers: { "x-origin-secret": "origin-secret-value", cookie: `other=1; ${SESSION_COOKIE}=${TOKEN}` } });
    expect(response.statusCode).toBe(204);
  });

  it("reads a base64 body, whatever the content type", () => {
    const body = Buffer.from(batch([page])).toString("base64");
    const { response, lines } = run(request({ body, isBase64Encoded: true, headers: { "content-type": "text/plain" } }));
    expect(response.statusCode).toBe(204);
    expect(lines).toHaveLength(1);
  });
});

describe("handleEvents logging", () => {
  it("logs one line per valid event with env and received, and leaves out the invalid ones", () => {
    const { response, lines } = run(request({ body: batch([page, { type: "unknown", t: "x", seq: 1, session: "tab-1" }, click, "junk", null]) }));
    expect(response).toEqual({ statusCode: 204 });
    expect(lines).toEqual([
      `[client-event] ${JSON.stringify({ ...page, env: "staging", received: "2026-11-23T12:00:00.000Z" })}`,
      `[client-event] ${JSON.stringify({ ...click, env: "staging", received: "2026-11-23T12:00:00.000Z" })}`,
    ]);
  });

  it("logs nothing about the request: no cookie, header value, address or user agent", () => {
    const event = request({ body: batch([page, click]) });
    const { lines: good } = run(event);
    const { lines: refused } = run({ ...event, cookies: [], headers: { ...event.headers, "x-origin-secret": "wrong-secret-value" } });
    const output = [...good, ...refused].join("\n");
    for (const secret of [TOKEN, "origin-secret-value", "wrong-secret-value", "a-long-enough-password", "secret-agent/1.0", "203.0.113.9", "application/json", "same-origin"]) {
      expect(output).not.toContain(secret);
    }
    expect(good).toHaveLength(2);
    expect(refused).toHaveLength(1);
  });
});
