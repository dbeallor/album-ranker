import { afterEach, describe, expect, it, vi } from "vitest";
import { getConfig, type Config } from "./config";

type Case = {
  name: string;
  variable: string;
  field: keyof Config;
  env: string | undefined;
  expected: string | Error;
};

const cases: Case[] = [
  { name: "DATABASE_PATH unset gives the default", variable: "DATABASE_PATH", field: "databasePath", env: undefined, expected: "./data/album-ranker.db" },
  { name: "DATABASE_PATH set is used", variable: "DATABASE_PATH", field: "databasePath", env: "/tmp/other.db", expected: "/tmp/other.db" },
  { name: "DATABASE_PATH empty throws", variable: "DATABASE_PATH", field: "databasePath", env: "", expected: new Error("DATABASE_PATH") },
  { name: "DATABASE_PATH whitespace throws", variable: "DATABASE_PATH", field: "databasePath", env: "   ", expected: new Error("DATABASE_PATH") },
  { name: "MUSICBRAINZ_USER_AGENT unset gives the default", variable: "MUSICBRAINZ_USER_AGENT", field: "musicbrainzUserAgent", env: undefined, expected: "album-ranker/0.1" },
  { name: "MUSICBRAINZ_USER_AGENT set is used", variable: "MUSICBRAINZ_USER_AGENT", field: "musicbrainzUserAgent", env: "album-ranker/0.1 (me@example.com)", expected: "album-ranker/0.1 (me@example.com)" },
  { name: "MUSICBRAINZ_USER_AGENT empty throws", variable: "MUSICBRAINZ_USER_AGENT", field: "musicbrainzUserAgent", env: "", expected: new Error("MUSICBRAINZ_USER_AGENT") },
  { name: "MUSICBRAINZ_USER_AGENT whitespace throws", variable: "MUSICBRAINZ_USER_AGENT", field: "musicbrainzUserAgent", env: "   ", expected: new Error("MUSICBRAINZ_USER_AGENT") },
];

describe("getConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(cases)("$name", ({ variable, field, env, expected }) => {
    vi.stubEnv("DATABASE_PATH", undefined);
    vi.stubEnv("MUSICBRAINZ_USER_AGENT", undefined);
    if (env !== undefined) {
      vi.stubEnv(variable, env);
    }

    if (expected instanceof Error) {
      expect(() => getConfig()).toThrow(expected.message);
    } else {
      expect(getConfig()[field]).toBe(expected);
    }
  });
});
