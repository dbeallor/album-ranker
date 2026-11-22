// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSessionToken, SESSION_COOKIE } from "./session";

const state = vi.hoisted(() => ({ cookie: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === state.cookie?.split("=")[0] ? { value: state.cookie.split("=")[1] } : undefined) }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

import { requireSession } from "./require-session";

const PASSWORD = "correct horse battery";
const good = `${SESSION_COOKIE}=${createSessionToken({ password: PASSWORD, deployEnv: "staging" })}`;
const goodLocal = `${SESSION_COOKIE}=${createSessionToken({ password: PASSWORD, deployEnv: null })}`;

const cases: { name: string; env: Record<string, string | undefined>; cookie: string | undefined; expected: string }[] = [
  { name: "no gate configured passes without a cookie", env: {}, cookie: undefined, expected: "" },
  { name: "a valid session passes", env: { DEPLOY_ENV: "staging", APP_PASSWORD: PASSWORD }, cookie: good, expected: "" },
  { name: "a valid local session passes", env: { APP_PASSWORD: PASSWORD }, cookie: goodLocal, expected: "" },
  { name: "no cookie redirects to login", env: { DEPLOY_ENV: "staging", APP_PASSWORD: PASSWORD }, cookie: undefined, expected: "redirect:/login" },
  { name: "a cookie signed for another environment redirects", env: { DEPLOY_ENV: "production", APP_PASSWORD: PASSWORD }, cookie: good, expected: "redirect:/login" },
  { name: "a local gate with no cookie redirects", env: { APP_PASSWORD: PASSWORD }, cookie: undefined, expected: "redirect:/login" },
  { name: "deployed with no password throws naming it", env: { DEPLOY_ENV: "staging" }, cookie: good, expected: "APP_PASSWORD" },
];

describe("requireSession", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    state.cookie = undefined;
  });

  it.each(cases)("$name", async ({ env, cookie, expected }) => {
    vi.stubEnv("DEPLOY_ENV", undefined);
    vi.stubEnv("APP_PASSWORD", undefined);
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
    state.cookie = cookie;

    const message = await requireSession().then(
      () => "",
      (error: Error) => error.message,
    );
    expect(message).toContain(expected);
    if (expected === "") expect(message).toBe("");
  });
});
