import { afterEach, describe, expect, it, vi } from "vitest";
import { homedir } from "node:os";
import { join } from "node:path";
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
  { name: "BACKUP_DIR unset gives the default under the home directory", variable: "BACKUP_DIR", field: "backupDir", env: undefined, expected: join(homedir(), ".album-ranker", "backups") },
  { name: "BACKUP_DIR set is used", variable: "BACKUP_DIR", field: "backupDir", env: "/tmp/my-backups", expected: "/tmp/my-backups" },
  { name: "BACKUP_DIR starting with ~ is expanded", variable: "BACKUP_DIR", field: "backupDir", env: "~/my-backups", expected: join(homedir(), "my-backups") },
  { name: "BACKUP_DIR empty throws", variable: "BACKUP_DIR", field: "backupDir", env: "", expected: new Error("BACKUP_DIR") },
  { name: "BACKUP_DIR whitespace throws", variable: "BACKUP_DIR", field: "backupDir", env: "   ", expected: new Error("BACKUP_DIR") },
  { name: "MUSICBRAINZ_USER_AGENT unset gives the default", variable: "MUSICBRAINZ_USER_AGENT", field: "musicbrainzUserAgent", env: undefined, expected: "album-ranker/0.1" },
  { name: "MUSICBRAINZ_USER_AGENT set is used", variable: "MUSICBRAINZ_USER_AGENT", field: "musicbrainzUserAgent", env: "album-ranker/0.1 (me@example.com)", expected: "album-ranker/0.1 (me@example.com)" },
  { name: "MUSICBRAINZ_USER_AGENT empty throws", variable: "MUSICBRAINZ_USER_AGENT", field: "musicbrainzUserAgent", env: "", expected: new Error("MUSICBRAINZ_USER_AGENT") },
  { name: "MUSICBRAINZ_USER_AGENT whitespace throws", variable: "MUSICBRAINZ_USER_AGENT", field: "musicbrainzUserAgent", env: "   ", expected: new Error("MUSICBRAINZ_USER_AGENT") },
  { name: "MUSICBRAINZ_URL unset gives the default", variable: "MUSICBRAINZ_URL", field: "musicbrainzUrl", env: undefined, expected: "https://musicbrainz.org" },
  { name: "MUSICBRAINZ_URL set is used without a trailing slash", variable: "MUSICBRAINZ_URL", field: "musicbrainzUrl", env: "http://127.0.0.1:3101/", expected: "http://127.0.0.1:3101" },
  { name: "MUSICBRAINZ_URL empty throws", variable: "MUSICBRAINZ_URL", field: "musicbrainzUrl", env: "", expected: new Error("MUSICBRAINZ_URL") },
  { name: "MUSICBRAINZ_URL whitespace throws", variable: "MUSICBRAINZ_URL", field: "musicbrainzUrl", env: "   ", expected: new Error("MUSICBRAINZ_URL") },
  { name: "COVER_ART_ARCHIVE_URL unset gives the default", variable: "COVER_ART_ARCHIVE_URL", field: "coverArtArchiveUrl", env: undefined, expected: "https://coverartarchive.org" },
  { name: "COVER_ART_ARCHIVE_URL set is used without a trailing slash", variable: "COVER_ART_ARCHIVE_URL", field: "coverArtArchiveUrl", env: "http://127.0.0.1:3101/", expected: "http://127.0.0.1:3101" },
  { name: "COVER_ART_ARCHIVE_URL empty throws", variable: "COVER_ART_ARCHIVE_URL", field: "coverArtArchiveUrl", env: "", expected: new Error("COVER_ART_ARCHIVE_URL") },
  { name: "DEEZER_URL unset gives the default", variable: "DEEZER_URL", field: "deezerUrl", env: undefined, expected: "https://api.deezer.com" },
  { name: "DEEZER_URL set is used without a trailing slash", variable: "DEEZER_URL", field: "deezerUrl", env: "http://127.0.0.1:3101/", expected: "http://127.0.0.1:3101" },
  { name: "DEEZER_URL empty throws", variable: "DEEZER_URL", field: "deezerUrl", env: "", expected: new Error("DEEZER_URL") },
];

describe("getConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(cases)("$name", ({ variable, field, env, expected }) => {
    vi.stubEnv("DATABASE_PATH", undefined);
    vi.stubEnv("BACKUP_DIR", undefined);
    vi.stubEnv("MUSICBRAINZ_USER_AGENT", undefined);
    vi.stubEnv("MUSICBRAINZ_URL", undefined);
    vi.stubEnv("COVER_ART_ARCHIVE_URL", undefined);
    vi.stubEnv("DEEZER_URL", undefined);
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
