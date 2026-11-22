import { NextResponse, type NextRequest } from "next/server";
import { gateDecision, ORIGIN_HEADER } from "@/lib/auth/gate";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { readGateConfig } from "@/lib/config";

const ROBOTS = "noindex, nofollow";

function respond(response: NextResponse): NextResponse {
  response.headers.set("X-Robots-Tag", ROBOTS);
  return response;
}

/**
 * The address the browser used. Behind CloudFront the request's Host is the function URL's, so a redirect built from
 * `request.url` would point past CloudFront. The CloudFront function in infra/modules/app sets `x-forwarded-host`, and the
 * function URL sets `x-forwarded-proto`; locally neither is set and the request's own URL is right.
 */
function publicOrigin(request: NextRequest): string {
  const host = request.headers.get("x-forwarded-host");
  if (!host) return request.url;
  return `${request.headers.get("x-forwarded-proto") ?? "https"}://${host}`;
}

export function proxy(request: NextRequest): NextResponse {
  const decision = gateDecision({
    gate: readGateConfig(),
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    method: request.method,
    accept: request.headers.get("accept"),
    sessionCookie: request.cookies.get(SESSION_COOKIE)?.value,
    originHeader: request.headers.get(ORIGIN_HEADER),
  });

  if (decision.action === "pass") return respond(NextResponse.next());
  if (decision.action === "redirect") return respond(NextResponse.redirect(new URL(decision.location, publicOrigin(request))));
  return respond(new NextResponse(null, { status: decision.status }));
}

// Build files come straight from S3 in a deployed environment; locally they are public and the login page needs them.
export const config = { matcher: ["/((?!_next/static).*)"] };
