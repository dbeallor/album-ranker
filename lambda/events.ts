// The events Lambda function (ALBUM-85): receives batches of front-end events from the browser and writes each valid
// event as one log line. A plain Node.js handler for a Lambda function URL (payload format 2.0), with no Next.js, no
// Web Adapter and no database. `npm run build:lambda` transpiles it with what it imports into dist/events/.
import { safeEqual } from "../lib/auth/compare.ts";
import { SESSION_COOKIE, verifySessionToken } from "../lib/auth/session.ts";
import { cleanBatch } from "../lib/client-events/clean.ts";
import type { DeployEnv } from "../lib/config.ts";

const MAX_BODY_BYTES = 32 * 1024;

/** The parts of a function URL request this handler reads. */
export type EventsRequest = {
  headers?: Record<string, string | undefined>;
  cookies?: string[];
  body?: string;
  isBase64Encoded?: boolean;
  requestContext?: { http?: { method?: string } };
};

export type EventsResponse = { statusCode: number };

export type EventsEnv = Record<string, string | undefined>;

function deployEnvOf(value: string | undefined): DeployEnv | null {
  return value === "staging" || value === "production" ? value : null;
}

/** The values of every `album_session` cookie sent, from the `cookies` array and from a `cookie` header. */
function sessionCookies(event: EventsRequest): string[] {
  const pairs = [...(event.cookies ?? []), ...(event.headers?.cookie ?? "").split(";")];
  return pairs.flatMap((pair) => {
    const at = pair.indexOf("=");
    return at !== -1 && pair.slice(0, at).trim() === SESSION_COOKIE ? [pair.slice(at + 1).trim()] : [];
  });
}

/**
 * Answers one request, in the order the spec lists. `log` gets whole lines; nothing about the request itself (cookie,
 * headers, IP address, user agent) is ever passed to it.
 */
export function handleEvents(event: EventsRequest, env: EventsEnv, log: (line: string) => void, now: Date = new Date()): EventsResponse {
  if (env.CLIENT_EVENTS === "off") return { statusCode: 404 };

  const refuse = (status: number, reason: string): EventsResponse => {
    log(`[client-event-refused] ${JSON.stringify({ status, reason })}`);
    return { statusCode: status };
  };

  const headers = event.headers ?? {};
  if (!env.ORIGIN_SECRET || !safeEqual(headers["x-origin-secret"] ?? "", env.ORIGIN_SECRET)) return refuse(403, "origin-secret");
  if (event.requestContext?.http?.method?.toUpperCase() !== "POST") return refuse(405, "method");
  const site = headers["sec-fetch-site"];
  if (site !== undefined && site !== "same-origin") return refuse(403, "cross-site");
  const secret = { password: env.APP_PASSWORD ?? "", deployEnv: deployEnvOf(env.DEPLOY_ENV) };
  if (!secret.password || !sessionCookies(event).some((token) => verifySessionToken(token, secret))) return refuse(401, "session");

  const raw = Buffer.from(event.body ?? "", event.isBase64Encoded ? "base64" : "utf8");
  if (raw.length > MAX_BODY_BYTES) return refuse(413, "too-large");

  let batch;
  try {
    batch = cleanBatch(JSON.parse(raw.toString("utf8")));
  } catch {
    batch = null;
  }
  if (batch === null) return refuse(400, "bad-body");

  const received = now.toISOString();
  for (const clientEvent of batch) {
    log(`[client-event] ${JSON.stringify({ ...clientEvent, env: secret.deployEnv ?? "unknown", received })}`);
  }
  return { statusCode: 204 };
}

/** Lambda handler: `lambda/events.handler` in dist/events. */
export async function handler(event: EventsRequest): Promise<EventsResponse> {
  return handleEvents(event, process.env, (line) => console.log(line));
}
