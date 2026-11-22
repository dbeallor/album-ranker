import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { gatePasswordProblem, readGateConfig } from "../config";
import { SESSION_COOKIE, verifySessionToken } from "./session";

/**
 * Call first in every server action. The proxy already gates the request, but a proxy matcher can stop covering a
 * route when it moves, so each action checks the session itself. A no-op when no gate is configured (local runs).
 */
export async function requireSession(): Promise<void> {
  const gate = readGateConfig();
  if (gate.deployEnv === null && gate.appPassword === null) return;
  const problem = gatePasswordProblem(gate);
  if (problem || gate.appPassword === null) throw new Error(problem ?? "APP_PASSWORD is not set.");
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!verifySessionToken(token, { password: gate.appPassword, deployEnv: gate.deployEnv })) redirect("/login");
}
