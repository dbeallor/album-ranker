import { gatePasswordProblem, type GateConfig } from "../config";
import { safeEqual } from "./compare";
import { verifySessionToken } from "./session";

export const ORIGIN_HEADER = "x-origin-secret";

export type GateInput = {
  gate: GateConfig;
  pathname: string;
  search: string;
  method: string;
  accept: string | null;
  sessionCookie: string | undefined;
  originHeader: string | null;
  now?: number;
};

export type GateDecision =
  | { action: "pass" }
  | { action: "redirect"; location: string }
  | { action: "deny"; status: 401 | 403 | 503 };

/** The proxy's whole decision, free of Next.js types so each rule can be tested. */
export function gateDecision(input: GateInput): GateDecision {
  const { gate } = input;
  if (gate.deployEnv === null && gate.appPassword === null) return { action: "pass" };
  if (gatePasswordProblem(gate) !== null || gate.appPassword === null) return { action: "deny", status: 503 };
  // Only CloudFront should reach a deployed function.
  if (gate.deployEnv !== null && (gate.originSecret === null || !safeEqual(input.originHeader ?? "", gate.originSecret))) {
    return { action: "deny", status: 403 };
  }
  if (input.pathname === "/login") return { action: "pass" };
  if (verifySessionToken(input.sessionCookie, { password: gate.appPassword, deployEnv: gate.deployEnv }, input.now)) {
    return { action: "pass" };
  }
  const isPage = (input.method === "GET" || input.method === "HEAD") && (input.accept ?? "").includes("text/html");
  if (!isPage) return { action: "deny", status: 401 };
  return { action: "redirect", location: `/login?${new URLSearchParams({ next: input.pathname + input.search })}` };
}
