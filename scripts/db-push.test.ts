// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDatabase } from "../lib/db/connection.ts";
import type { ObjectStore } from "../lib/db/s3-sync.ts";
import { parseArgs, run, type Deps } from "./db-push.ts";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "album-ranker-db-push-test-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function deps(overrides: Partial<Deps> = {}): Deps & { terraformBucket: ReturnType<typeof vi.fn>; createStore: ReturnType<typeof vi.fn> } {
  return {
    databasePath: join(root, "album-ranker.db"),
    backupDir: join(root, "backups"),
    terraformBucket: vi.fn(() => "terraform-bucket"),
    createStore: vi.fn(),
    ask: vi.fn(async () => true),
    isTerminal: false,
    log: () => {},
    warn: () => {},
    ...overrides,
  } as Deps & { terraformBucket: ReturnType<typeof vi.fn>; createStore: ReturnType<typeof vi.fn> };
}

describe("db:push arguments", () => {
  const bad: { name: string; argv: string[]; message: RegExp }[] = [
    { name: "production without --confirm-production", argv: ["production"], message: /--confirm-production/ },
    { name: "no environment", argv: ["--dry-run"], message: /exactly one environment/ },
    { name: "two environments", argv: ["staging", "production", "--confirm-production"], message: /exactly one environment/ },
    { name: "an unknown flag", argv: ["staging", "--force"], message: /Unknown argument: --force/ },
    { name: "a flag with no value", argv: ["staging", "--bucket"], message: /--bucket needs a value/ },
  ];
  for (const { name, argv, message } of bad) {
    it(`refuses ${name} before Terraform or AWS is touched`, async () => {
      const spies = deps();
      await expect(run(argv, spies)).rejects.toThrow(message);
      expect(spies.terraformBucket).not.toHaveBeenCalled();
      expect(spies.createStore).not.toHaveBeenCalled();
    });
  }

  it("reads every flag, with a space or an equals sign", () => {
    expect(parseArgs(["production", "--confirm-production", "--dry-run", "--bucket", "b", "--region=eu-west-1", "--expect-etag", '"e"', "--yes"])).toEqual({
      environment: "production",
      dryRun: true,
      yes: true,
      bucket: "b",
      region: "eu-west-1",
      expectEtag: '"e"',
    });
  });

  it("with no terminal and no --yes, replaces nothing", async () => {
    const path = join(root, "album-ranker.db");
    openDatabase(path, { skipBackup: true }).close();
    const existing = { body: new Uint8Array(readFileSync(path)), etag: '"e"' };
    const put = vi.fn();
    const store: ObjectStore = { head: async () => ({ etag: existing.etag }), get: async () => existing, put };
    const spies = deps({ createStore: vi.fn(() => store) });

    await expect(run(["staging", "--bucket", "b"], spies)).rejects.toThrow(/no terminal to ask in/);
    expect(put).not.toHaveBeenCalled();
    expect(spies.terraformBucket).not.toHaveBeenCalled();
  });
});
