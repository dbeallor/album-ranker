import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createS3Sync, shareSync, type ObjectStore } from "./s3-sync.ts";
import { getDb } from "./server.ts";

afterEach(() => {
  shareSync(undefined);
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("getDb", () => {
  it("returns the connection the S3 sync owns, even after it reloads", async () => {
    vi.stubEnv("DATABASE_S3_BUCKET", "data");
    vi.stubEnv("DATABASE_S3_KEY", "album-ranker.db");
    const store: ObjectStore = {
      head: async () => null,
      get: async () => null,
      put: async () => ({ etag: '"1"' }),
    };
    const dir = mkdtempSync(join(tmpdir(), "album-ranker-server-test-"));
    const sync = createS3Sync({ store, path: join(dir, "album-ranker.db"), log: () => {} });
    shareSync(sync);
    await sync.beforeRequest();

    try {
      expect(getDb()).toBe(sync.db());
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses to open a local file when S3 storage is configured but the wrapper isn't running", () => {
    vi.stubEnv("DATABASE_S3_BUCKET", "data");
    vi.stubEnv("DATABASE_S3_KEY", "album-ranker.db");

    expect(() => getDb()).toThrow(/lambda\/server\.ts/);
  });

  it("opens the local file as before when the S3 settings are unset", async () => {
    vi.stubEnv("DATABASE_S3_BUCKET", undefined);
    vi.stubEnv("DATABASE_S3_KEY", undefined);
    vi.stubEnv("DATABASE_PATH", ":memory:");

    const db = getDb();

    expect(db.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get()?.n).toBeGreaterThan(0);
    expect(getDb()).toBe(db);
  });
});
