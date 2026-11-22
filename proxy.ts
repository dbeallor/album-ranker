import { NextResponse, type NextRequest } from "next/server";
import { gateDecision, ORIGIN_HEADER } from "@/lib/auth/gate";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { readGateConfig } from "@/lib/config";

const ROBOTS = "noindex, nofollow";

function respond(response: NextResponse): NextResponse {
  response.headers.set("X-Robots-Tag", ROBOTS);
  return response;
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
  if (decision.action === "redirect") return respond(NextResponse.redirect(new URL(decision.location, request.url)));
  return respond(new NextResponse(null, { status: decision.status }));
}

// Build files come straight from S3 in a deployed environment; locally they are public and the login page needs them.
export const config = { matcher: ["/((?!_next/static).*)"] };
