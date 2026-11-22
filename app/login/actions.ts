"use server";

// The one server action that does not call requireSession(): it is how a session starts.
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeEqual } from "@/lib/auth/compare";
import { logGate } from "@/lib/auth/gate-log";
import { clientIp, loginLimiter, VIEWER_IP_HEADER } from "@/lib/auth/login-limiter";
import { safeNext } from "@/lib/auth/redirect-target";
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/auth/session";
import { gatePasswordProblem, readGateConfig } from "@/lib/config";

const FAILURE_PAUSE_MS = 1000;

function loginUrl(next: string, error: "wrong" | "locked"): string {
  const params = new URLSearchParams(next === "/" ? {} : { next });
  params.set("error", error);
  return `/login?${params}`;
}

export async function loginAction(formData: FormData): Promise<void> {
  const gate = readGateConfig();
  const problem = gatePasswordProblem(gate);
  if (problem) throw new Error(problem);
  const next = safeNext(formData.get("next"));
  if (gate.appPassword === null) redirect(next); // no gate configured: nothing to log in to

  const ip = clientIp((await headers()).get(VIEWER_IP_HEADER));
  if (loginLimiter.isLocked(ip)) {
    logGate({ event: "login-locked", ip });
    redirect(loginUrl(next, "locked"));
  }

  const password = formData.get("password");
  if (typeof password !== "string" || !safeEqual(password, gate.appPassword)) {
    const locked = loginLimiter.recordFailure(ip);
    logGate(locked ? { event: "login-failed", ip, locked: true } : { event: "login-failed", ip });
    await new Promise((resolve) => setTimeout(resolve, FAILURE_PAUSE_MS));
    redirect(loginUrl(next, "wrong"));
  }

  loginLimiter.recordSuccess(ip);
  (await cookies()).set(SESSION_COOKIE, createSessionToken({ password: gate.appPassword, deployEnv: gate.deployEnv }), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: gate.deployEnv !== null,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  redirect(next);
}
