// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

const state = vi.hoisted(() => ({ set: [] as [string, string, Record<string, unknown>][], viewer: null as string | null }));

vi.mock("next/headers", () => ({
  cookies: async () => ({ set: (name: string, value: string, options: Record<string, unknown>) => state.set.push([name, value, options]) }),
  headers: async () => ({ get: (name: string) => (name === "x-viewer-ip" ? state.viewer : null) }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

import { loginAction } from "./actions";

const PASSWORD = "correct horse battery";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

async function run(fields: Record<string, string>): Promise<string> {
  const pending = loginAction(form(fields)).then(
    () => "",
    (error: Error) => error.message,
  );
  await vi.advanceTimersByTimeAsync(1000);
  return pending;
}

describe("loginAction", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("DEPLOY_ENV", "staging");
    vi.stubEnv("APP_PASSWORD", PASSWORD);
    state.set = [];
    state.viewer = "203.0.113.7";
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  const cases: { name: string; fields: Record<string, string>; redirect: string; cookie: boolean }[] = [
    { name: "the right password sets the cookie and goes home", fields: { password: PASSWORD }, redirect: "redirect:/", cookie: true },
    { name: "the right password goes to a path on this site", fields: { password: PASSWORD, next: "/library?sort=year" }, redirect: "redirect:/library?sort=year", cookie: true },
    { name: "the right password never goes to another site", fields: { password: PASSWORD, next: "//evil.example" }, redirect: "redirect:/", cookie: true },
    { name: "a wrong password sets no cookie and says so", fields: { password: "nope", next: "/library" }, redirect: "redirect:/login?next=%2Flibrary&error=wrong", cookie: false },
    { name: "a missing password counts as wrong", fields: {}, redirect: "redirect:/login?error=wrong", cookie: false },
  ];

  it.each(cases)("$name", async ({ fields, redirect, cookie }) => {
    expect(await run(fields)).toBe(redirect);
    expect(state.set).toHaveLength(cookie ? 1 : 0);
    if (cookie) {
      const [name, value, options] = state.set[0];
      expect(name).toBe(SESSION_COOKIE);
      expect(verifySessionToken(value, { password: PASSWORD, deployEnv: "staging" })).toBe(true);
      expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", secure: true, maxAge: 90 * 24 * 60 * 60 });
    }
  });

  it("pauses a second before answering a wrong password", async () => {
    const pending = loginAction(form({ password: "nope" })).catch((error: Error) => error.message);
    let settled = false;
    void pending.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toBe("redirect:/login?error=wrong");
  });

  it("locks an IP after 10 wrong passwords, and refuses even the right one", async () => {
    state.viewer = "198.51.100.9";
    for (let i = 0; i < 10; i++) expect(await run({ password: "nope" })).toBe("redirect:/login?error=wrong");
    expect(await run({ password: PASSWORD })).toBe("redirect:/login?error=locked");
    expect(state.set).toHaveLength(0);

    state.viewer = "198.51.100.10";
    expect(await run({ password: PASSWORD })).toBe("redirect:/");
  });
});
