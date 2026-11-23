// @vitest-environment node
import { describe, expect, it } from "vitest";
import { nextBuildEnv } from "./index.ts";

describe("nextBuildEnv", () => {
  it("switches on front-end event capture and keeps the rest of the environment", () => {
    const base = { ...process.env, NEXT_PUBLIC_CLIENT_EVENTS: "0", SOME_OTHER_VAR: "kept" };
    expect(nextBuildEnv(base)).toEqual({ ...base, NEXT_PUBLIC_CLIENT_EVENTS: "1" });
  });
});
