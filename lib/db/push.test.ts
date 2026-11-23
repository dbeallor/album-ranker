// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAlbum } from "./albums.ts";
import { backupFolder, countRowsAt, type Counts } from "./backup.ts";
import { openDatabase } from "./connection.ts";
import { pushDatabase, type PushOptions, type PushSummary } from "./push.ts";
import { ConditionFailedError, type ObjectStore, type PutCondition } from "./s3-sync.ts";

type Version = { body: Uint8Array; etag: string; versionId: string };

/** A fake versioned bucket holding one key, with the same conditional-write rules as S3. */
class FakeStore implements ObjectStore {
  versions: Version[] = [];
  /** Runs after `get` has read the object, to change it the way another writer would. */
  afterGet: (() => void) | undefined;
  /** Runs when `put` starts, before its condition is checked. */
  onPut: (() => void) | undefined;
  puts: PutCondition[] = [];
  private counter = 0;

  /** Adds a version as another writer would. */
  write(body: Uint8Array): Version {
    const n = ++this.counter;
    const version = { body, etag: `"etag-${n}"`, versionId: `version-${n}` };
    this.versions.push(version);
    return version;
  }

  get current(): Version | undefined {
    return this.versions.at(-1);
  }

  async head(): ReturnType<ObjectStore["head"]> {
    const current = this.current;
    return current ? { etag: current.etag, versionId: current.versionId, lastModified: new Date("2026-11-20T12:00:00Z") } : null;
  }

  async get() {
    const current = this.current;
    const result = current ? { body: current.body, etag: current.etag } : null;
    this.afterGet?.();
    return result;
  }

  async put(body: Uint8Array, condition: PutCondition) {
    this.puts.push(condition);
    this.onPut?.();
    const held = "ifMatch" in condition ? this.current?.etag === condition.ifMatch : this.current === undefined;
    if (!held) throw new ConditionFailedError();
    const version = this.write(body);
    return { etag: version.etag, versionId: version.versionId };
  }
}

let root: string;
let store: FakeStore;
let logs: string[];

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "album-ranker-push-test-"));
  store = new FakeStore();
  logs = [];
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const localPath = () => join(root, "local", "album-ranker.db");
const backupDir = () => join(root, "backups");
const tempRoot = () => join(root, "temp");

/** Writes a database file with `albums` albums, a library album for the first and `matchups` matchups between the first two. */
function seed(path: string, albums: number, matchups = 0, extra?: (db: DatabaseSync) => void): void {
  const db = openDatabase(path, { skipBackup: true });
  const ids = Array.from({ length: albums }, (_, i) => createAlbum(db, { title: `Album ${i}`, artist: { name: `Artist ${i}` } }).id);
  if (albums > 0) db.prepare("INSERT INTO library_albums (album_id, year, added_at) VALUES (?, 2020, 'now')").run(ids[0]);
  for (let i = 0; i < matchups; i++) {
    db.prepare("INSERT INTO matchups (album_a_id, album_b_id, result, created_at) VALUES (?, ?, 'a', 'now')").run(ids[0], ids[1]);
  }
  extra?.(db);
  db.close();
}

/** The bytes of a database seeded like `seed`, as a deployed copy would be. */
function remoteBytes(albums: number, matchups = 0, extra?: (db: DatabaseSync) => void): Uint8Array {
  const path = join(root, `remote-${store.versions.length}-${Math.random().toString(36).slice(2)}.db`);
  seed(path, albums, matchups, extra);
  const db = new DatabaseSync(path);
  const copy = `${path}.copy`;
  db.prepare("VACUUM INTO ?").run(copy);
  db.close();
  return readFileSync(copy);
}

function countsOf(body: Uint8Array): Counts {
  const path = join(root, `inspect-${Math.random().toString(36).slice(2)}.db`);
  writeFileSync(path, body);
  return countRowsAt(path);
}

function options(overrides: Partial<PushOptions> = {}): PushOptions {
  return {
    store,
    environment: "staging",
    bucket: "staging-data",
    databasePath: localPath(),
    backupDir: backupDir(),
    tempRoot: tempRoot(),
    confirm: async () => true,
    log: (message) => logs.push(message),
    ...overrides,
  };
}

function backupFiles(): string[] {
  const folder = backupFolder(localPath(), backupDir());
  return existsSync(folder) ? readdirSync(folder).filter((name) => name.endsWith(".db")) : [];
}

function tempEntries(): string[] {
  return existsSync(tempRoot()) ? readdirSync(tempRoot()) : [];
}

describe("pushDatabase", () => {
  beforeEach(() => {
    mkdirSync(tempRoot(), { recursive: true });
    seed(localPath(), 3, 1);
  });

  it("uploads to an empty bucket without asking, using If-None-Match", async () => {
    const confirm = vi.fn(async () => true);
    const result = await pushDatabase(options({ confirm }));

    expect(confirm).not.toHaveBeenCalled();
    expect(store.puts).toEqual([{ ifNoneMatch: "*" }]);
    expect(countsOf(store.current!.body)).toEqual({ albums: 3, libraryAlbums: 1, matchups: 1 });
    expect(result.uploaded).toMatchObject({ etag: store.current!.etag, versionId: store.current!.versionId });
    expect(result.undo?.commands).toEqual([]);
    expect(tempEntries()).toEqual([]);
  });

  it("asks once with both sides' counts before replacing, and writes with the ETag it read", async () => {
    const previous = store.write(remoteBytes(5, 4));
    const confirm = vi.fn<(summary: PushSummary) => boolean>(() => true);

    const result = await pushDatabase(options({ confirm }));

    expect(confirm).toHaveBeenCalledOnce();
    const summary = confirm.mock.calls[0][0];
    expect(summary.local.counts).toEqual({ albums: 3, libraryAlbums: 1, matchups: 1 });
    expect(summary.remote?.data?.counts).toEqual({ albums: 5, libraryAlbums: 1, matchups: 4 });
    expect(summary.remote).toMatchObject({ etag: previous.etag, versionId: previous.versionId });
    expect(store.puts).toEqual([{ ifMatch: previous.etag }]);
    expect(result.previousVersionId).toBe(previous.versionId);
  });

  const refusals: { name: string; setup: () => Partial<PushOptions>; message: RegExp }[] = [
    { name: "the answer is no", setup: () => ({ confirm: async () => false }), message: /Not uploaded\. Nothing was changed/ },
    { name: "--expect-etag differs from the remote", setup: () => ({ expectEtag: '"older"' }), message: /remote changed since your dry run/ },
    {
      name: "the store's ETag changes between the read and the write",
      setup: () => {
        store.afterGet = () => {
          store.afterGet = undefined;
          store.write(remoteBytes(9, 9));
        };
        return {};
      },
      message: /changed while this ran.*Nothing was uploaded/,
    },
    {
      name: "the local file is missing",
      setup: () => {
        rmSync(localPath());
        return {};
      },
      message: /no database at .*nothing to push/,
    },
  ];
  for (const { name, setup, message } of refusals) {
    it(`uploads nothing when ${name}`, async () => {
      store.write(remoteBytes(5, 4));
      const before = [...store.versions];
      const changed = setup();

      await expect(pushDatabase(options(changed))).rejects.toThrow(message);

      // The store has what it had, plus only the other writer's version in the race case.
      expect(store.versions.slice(0, before.length)).toEqual(before);
      expect(store.versions.every((version) => countsOf(version.body).albums !== 3)).toBe(true);
      expect(tempEntries()).toEqual([]);
    });
  }

  it("uploads nothing when --expect-etag is given and there is no remote", async () => {
    await expect(pushDatabase(options({ expectEtag: '"gone"' }))).rejects.toThrow(/remote changed since your dry run/);
    expect(store.versions).toEqual([]);
    expect(store.puts).toEqual([]);
  });

  it("a dry run writes nothing and reports the next command", async () => {
    const remote = store.write(remoteBytes(5, 4));

    const result = await pushDatabase(options({ dryRun: true, environment: "production" }));

    expect(store.puts).toEqual([]);
    expect(store.versions).toHaveLength(1);
    expect(backupFiles()).toEqual([]);
    expect(result.backupPath).toBeUndefined();
    expect(tempEntries()).toEqual([]);
    expect(result.summary.local.counts.albums).toBe(3);
    expect(result.summary.remote?.data?.counts.albums).toBe(5);
    expect(result.summary.remote?.etag).toBe(remote.etag);
    expect(result.nextCommand).toBe(`npm run db:push -- production --bucket 'staging-data' --expect-etag '${remote.etag}' --confirm-production`);
  });

  it("backs up the local file before the upload starts", async () => {
    let filesAtPut: string[] = [];
    store.onPut = () => {
      filesAtPut = backupFiles();
    };

    const result = await pushDatabase(options());

    expect(filesAtPut).toHaveLength(1);
    expect(result.backupPath).toContain(filesAtPut[0]);
    expect(countsOf(readFileSync(result.backupPath!))).toEqual({ albums: 3, libraryAlbums: 1, matchups: 1 });
  });

  it("says a remote that isn't a database is one, and replaces it once confirmed", async () => {
    store.write(new TextEncoder().encode("not a database"));
    const confirm = vi.fn<(summary: PushSummary) => boolean>(() => true);

    await pushDatabase(options({ confirm }));

    const summary = confirm.mock.calls[0][0];
    expect(summary.remote?.data).toBeUndefined();
    expect(summary.remote?.unreadable).toMatch(/not a usable database|not an album-ranker database/);
    expect(countsOf(store.current!.body).albums).toBe(3);
  });

  it("can be undone by putting the previous version back, and prints the commands for it", async () => {
    const previous = store.write(remoteBytes(5, 4));

    const result = await pushDatabase(options());
    expect(countsOf(store.current!.body).albums).toBe(3);

    // What `copy-object --copy-source ...?versionId=` does: the old bytes become the newest version.
    store.write(store.versions.find((version) => version.versionId === previous.versionId)!.body);
    expect(countsOf(store.current!.body)).toEqual({ albums: 5, libraryAlbums: 1, matchups: 4 });
    expect(result.undo?.commands).toEqual([
      `aws s3api get-object --bucket staging-data --key album-ranker.db --version-id ${previous.versionId} ./before-push.db`,
      `aws s3api copy-object --bucket staging-data --key album-ranker.db --copy-source "staging-data/album-ranker.db?versionId=${previous.versionId}"`,
    ]);
  });

  it("notes there is no undo copy when S3 reports no version id", async () => {
    store.write(remoteBytes(2));
    const head = store.head.bind(store);
    store.head = async () => {
      const found = await head();
      return found && { etag: found.etag };
    };

    const result = await pushDatabase(options());

    expect(result.undo?.commands).toEqual([]);
    expect(result.undo?.note).toContain(result.backupPath!);
  });

  const warnings: { name: string; local?: (db: DatabaseSync) => void; remote: [number, number, ((db: DatabaseSync) => void)?]; warning: RegExp }[] = [
    { name: "the remote has more matchups", remote: [3, 9], warning: /more matchups or library albums/ },
    { name: "the remote has a migration version the local copy lacks", remote: [3, 1, (db) => db.exec("INSERT INTO schema_migrations (version, name, applied_at) VALUES (99, 'future', 'now')")], warning: /migration version your local file lacks/ },
    { name: "the local copy has a migration version this checkout doesn't know", local: (db) => db.exec("INSERT INTO schema_migrations (version, name, applied_at) VALUES (98, 'future', 'now')"), remote: [3, 1], warning: /migration version this checkout doesn't know/ },
  ];
  for (const { name, local, remote, warning } of warnings) {
    it(`warns when ${name}`, async () => {
      if (local) {
        rmSync(localPath());
        seed(localPath(), 3, 1, local);
      }
      store.write(remoteBytes(remote[0], remote[1], remote[2]));
      const confirm = vi.fn<(summary: PushSummary) => boolean>(() => true);

      await pushDatabase(options({ confirm }));

      expect(confirm.mock.calls[0][0].warnings.some((text) => warning.test(text))).toBe(true);
    });
  }
});
