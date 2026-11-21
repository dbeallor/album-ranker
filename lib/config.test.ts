import { afterEach, describe, expect, it, vi } from "vitest";
import { getConfig } from "./config";

describe("getConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const cases: { name: string; env: string | undefined; expected: string | Error }[] = [
    { name: "unset gives the default", env: undefined, expected: "./data/album-ranker.db" },
    { name: "a set value is used", env: "/tmp/other.db", expected: "/tmp/other.db" },
    { name: "an empty value throws", env: "", expected: new Error("DATABASE_PATH") },
    { name: "a whitespace value throws", env: "   ", expected: new Error("DATABASE_PATH") },
  ];

  it.each(cases)("$name", ({ env, expected }) => {
    if (env === undefined) {
      vi.stubEnv("DATABASE_PATH", undefined);
    } else {
      vi.stubEnv("DATABASE_PATH", env);
    }

    if (expected instanceof Error) {
      expect(() => getConfig()).toThrow(expected.message);
    } else {
      expect(getConfig().databasePath).toBe(expected);
    }
  });
});
