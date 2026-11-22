// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAlbum } from "./albums.ts";
import { openDatabase } from "./connection.ts";
import {
  ConditionFailedError,
  StoredDatabaseError,
  createS3Sync,
  serveWithSync,
  sharedSync,
  shareSync,
  type ObjectStore,
  type PutCondition,
  type S3Sync,
} from "./s3-sync.ts";

/** An in-memory stand-in for one S3 object with the same conditional-write rules. */
class FakeStore implements ObjectStore {
  object: { body: Uint8Array; etag: string } | null = null;
  calls: string[] = [];
  /** Held until released, to keep a write in flight. */
  gate: Promise<void> | undefined;
  /** Called with the first `put`, once it has started. */
  onPut: (() => void) | undefined;
  private version = 0;

  /** Replaces the object the way another writer (a restore, a second copy) would. */
  replace(body: Uint8Array): string {
    this.object = { body, etag: `"v${++this.version}"` };
    return this.object.etag;
  }

  async head() {
    this.calls.push("head");
    return this.object ? { etag: this.object.etag } : null;
  }

  async get() {
    this.calls.push("get");
    return this.object ? { body: this.object.body, etag: this.object.etag } : null;
  }

  async put(body: Uint8Array, condition: PutCondition) {
    this.calls.push("ifMatch" in condition ? `put If-Match ${condition.ifMatch}` : "put If-None-Match *");
    this.onPut?.();
    await this.gate;
    const held = "ifMatch" in condition ? this.object?.etag === condition.ifMatch : this.object === null;
    if (!held) throw new ConditionFailedError();
    return { etag: this.replace(body) };
  }

  get puts(): string[] {
    return this.calls.filter((call) => call.startsWith("put"));
  }
}

let root: string;
let workPath: string;
let store: FakeStore;
let logs: string[];

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "album-ranker-s3-sync-test-"));
  workPath = join(root, "tmp", "album-ranker.db");
  store = new FakeStore();
  logs = [];
  vi.stubEnv("BACKUP_DIR", join(root, "backups"));
});

afterEach(() => {
  shareSync(undefined);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

function newSync(): S3Sync {
  return createS3Sync({ store, path: workPath, log: (message) => logs.push(message) });
}

/** Bytes of a clean database file, as a previous upload would have stored them. */
function databaseBytes(setup: (db: DatabaseSync) => void = () => {}, migrationsDir?: string): Uint8Array {
  const path = join(root, `seed-${Math.random().toString(36).slice(2)}.db`);
  const db = openDatabase(path, { skipBackup: true, migrationsDir });
  setup(db);
  const out = `${path}.copy`;
  db.prepare("VACUUM INTO ?").run(out);
  db.close();
  return readFileSync(out);
}

function addAlbum(db: DatabaseSync, title: string): void {
  createAlbum(db, { title, artist: { name: `${title} Artist` } });
}

function albumTitles(db: DatabaseSync): string[] {
  return db.prepare("SELECT title FROM albums ORDER BY title").all().map((row) => String(row.title));
}

/** Titles in the database file stored in the fake S3. */
function storedTitles(): string[] {
  const path = join(root, "stored.db");
  writeFileSync(path, store.object!.body);
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    return albumTitles(db);
  } finally {
    db.close();
  }
}

async function request(sync: S3Sync, work: (db: DatabaseSync) => void = () => {}): Promise<void> {
  await sync.beforeRequest();
  work(sync.db());
  await sync.afterRequest();
}

describe("S3 sync", () => {
  it("downloads and opens the stored file on a cold start", async () => {
    store.replace(databaseBytes((db) => addAlbum(db, "Stored")));
    const sync = newSync();

    await sync.beforeRequest();

    expect(albumTitles(sync.db())).toEqual(["Stored"]);
    expect(store.calls).toEqual(["head", "get"]);
    expect(existsSync(workPath)).toBe(true);
  });

  it("creates and uploads an empty migrated database when the object is missing", async () => {
    const sync = newSync();

    await sync.beforeRequest();

    expect(store.puts).toEqual(["put If-None-Match *"]);
    expect(albumTitles(sync.db())).toEqual([]);
    expect(store.object).not.toBeNull();
    writeFileSync(join(root, "check.db"), store.object!.body);
    const check = new DatabaseSync(join(root, "check.db"), { readOnly: true });
    expect(check.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get()?.n).toBeGreaterThan(0);
    check.close();
  });

  it("treats an object deleted while a copy is loaded as a fresh environment", async () => {
    store.replace(databaseBytes((db) => addAlbum(db, "Old")));
    const sync = newSync();
    await request(sync);
    store.object = null;
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await sync.beforeRequest();

    expect(error).toHaveBeenCalledWith(expect.stringContaining("vanished"));
    error.mockRestore();
    expect(albumTitles(sync.db())).toEqual([]);
    expect(store.puts).toEqual(["put If-None-Match *"]);
  });

  describe("after a request", () => {
    const cases: { name: string; work: (db: DatabaseSync) => void; uploads: boolean }[] = [
      { name: "a write uploads", work: (db) => addAlbum(db, "New"), uploads: true },
      { name: "a read-only request uploads nothing", work: (db) => albumTitles(db), uploads: false },
      { name: "a request that opens and commits an empty transaction uploads nothing", work: (db) => db.exec("BEGIN; COMMIT;"), uploads: false },
    ];

    for (const { name, work, uploads } of cases) {
      it(name, async () => {
        const first = store.replace(databaseBytes());
        const sync = newSync();

        await request(sync, work);

        expect(store.puts).toEqual(uploads ? [`put If-Match ${first}`] : []);
        if (uploads) expect(storedTitles()).toEqual(["New"]);
      });
    }

    it("uploads with the ETag of the previous upload each time", async () => {
      const first = store.replace(databaseBytes());
      const sync = newSync();

      await request(sync, (db) => addAlbum(db, "One"));
      const second = store.object!.etag;
      await request(sync, (db) => addAlbum(db, "Two"));

      expect(store.puts).toEqual([`put If-Match ${first}`, `put If-Match ${second}`]);
      expect(storedTitles()).toEqual(["One", "Two"]);
    });

    it("stores a complete file, with nothing left in a WAL file", async () => {
      store.replace(databaseBytes());
      const sync = newSync();

      await request(sync, (db) => addAlbum(db, "In the WAL"));

      expect(existsSync(`${workPath}-wal`)).toBe(true); // the local copy still has its WAL; the stored file must not depend on it
      expect(storedTitles()).toEqual(["In the WAL"]);
    });

    it("leaves no temp files behind", async () => {
      store.replace(databaseBytes());
      const sync = newSync();
      await request(sync, (db) => addAlbum(db, "x"));
      expect(readdirSync(join(root, "tmp")).filter((name) => /upload|download/.test(name))).toEqual([]);
    });
  });

  it("checks the ETag with one HEAD per request and downloads only when it changed", async () => {
    store.replace(databaseBytes((db) => addAlbum(db, "A")));
    const sync = newSync();

    await request(sync);
    await request(sync);
    await request(sync);

    expect(store.calls).toEqual(["head", "get", "head", "head"]);
  });

  it("reloads before the request when the stored ETag changed", async () => {
    store.replace(databaseBytes((db) => addAlbum(db, "Before restore")));
    const sync = newSync();
    await request(sync);
    store.replace(databaseBytes((db) => addAlbum(db, "Restored")));

    await sync.beforeRequest();

    expect(albumTitles(sync.db())).toEqual(["Restored"]);
    expect(store.calls.filter((call) => call === "get")).toHaveLength(2);
    expect(store.puts).toEqual([]);
  });

  describe("a failed conditional write", () => {
    it("fails the request, drops the local copy and reloads what S3 holds next time", async () => {
      store.replace(databaseBytes((db) => addAlbum(db, "Original")));
      const sync = newSync();
      await sync.beforeRequest();
      addAlbum(sync.db(), "Lost write");
      store.replace(databaseBytes((db) => addAlbum(db, "Other writer"))); // a restore or a second copy got there first

      await expect(sync.afterRequest()).rejects.toBeInstanceOf(ConditionFailedError);

      expect(() => sync.db()).toThrow(/not loaded/);
      expect(existsSync(workPath)).toBe(false);
      expect(existsSync(`${workPath}-wal`)).toBe(false);
      await sync.beforeRequest();
      expect(albumTitles(sync.db())).toEqual(["Other writer"]);
      expect(storedTitles()).toEqual(["Other writer"]);
    });

    it("also drops the copy when the upload fails for another reason", async () => {
      store.replace(databaseBytes());
      const sync = newSync();
      await sync.beforeRequest();
      addAlbum(sync.db(), "x");
      vi.spyOn(store, "put").mockRejectedValue(new Error("network down"));

      await expect(sync.afterRequest()).rejects.toThrow("network down");

      expect(() => sync.db()).toThrow(/not loaded/);
    });

    it("fails a fresh environment's first upload when another copy created the object first", async () => {
      const sync = newSync();
      store.gate = Promise.resolve().then(() => {
        store.replace(databaseBytes());
      });

      await expect(sync.beforeRequest()).rejects.toBeInstanceOf(ConditionFailedError);
      expect(() => sync.db()).toThrow(/not loaded/);
    });
  });

  describe("a stored file that is not a database", () => {
    const cases: { name: string; bytes: () => Uint8Array }[] = [
      { name: "garbage bytes", bytes: () => new TextEncoder().encode("this is not sqlite at all, just some text".repeat(20)) },
      {
        name: "a SQLite file with no schema_migrations table",
        bytes: () => {
          const path = join(root, "other.db");
          const db = new DatabaseSync(path);
          db.exec("CREATE TABLE other (id INTEGER)");
          db.prepare("VACUUM INTO ?").run(`${path}.copy`);
          db.close();
          return readFileSync(`${path}.copy`);
        },
      },
    ];

    for (const { name, bytes } of cases) {
      it(`${name} gives an error, touches nothing in S3 and leaves no local copy`, async () => {
        const body = bytes();
        const etag = store.replace(body);
        const sync = newSync();

        await expect(sync.beforeRequest()).rejects.toBeInstanceOf(StoredDatabaseError);
        await expect(sync.beforeRequest()).rejects.toBeInstanceOf(StoredDatabaseError);

        expect(store.puts).toEqual([]);
        expect(store.object).toEqual({ body, etag });
        expect(store.calls.filter((call) => call === "get")).toHaveLength(1); // not downloaded again for the same ETag
        expect(existsSync(workPath)).toBe(false);
        expect(readdirSync(join(root, "tmp"))).toEqual([]);
        expect(logs.join("\n")).toMatch(/can't be opened/);
      });
    }

    it("recovers when a good file replaces it", async () => {
      store.replace(new TextEncoder().encode("junk".repeat(50)));
      const sync = newSync();
      await expect(sync.beforeRequest()).rejects.toBeInstanceOf(StoredDatabaseError);
      store.replace(databaseBytes((db) => addAlbum(db, "Good")));

      await sync.beforeRequest();

      expect(albumTitles(sync.db())).toEqual(["Good"]);
    });
  });

  describe("migrations", () => {
    function oldAndNewMigrations(): { oldDir: string; newDir: string } {
      const oldDir = join(root, "migrations-old");
      const newDir = join(root, "migrations-new");
      for (const dir of [oldDir, newDir]) {
        mkdirSync(dir);
        copyFileSync(join(process.cwd(), "lib", "db", "migrations", "001_initial.sql"), join(dir, "001_initial.sql"));
      }
      writeFileSync(join(newDir, "002_extra.sql"), "CREATE TABLE extra (id INTEGER PRIMARY KEY);");
      return { oldDir, newDir };
    }

    it("applies a pending migration to the stored file, uploads it, and skips the pre-migrate backup", async () => {
      const { oldDir, newDir } = oldAndNewMigrations();
      const first = store.replace(databaseBytes(() => {}, oldDir));
      const sync = createS3Sync({ store, path: workPath, migrationsDir: newDir, log: () => {} });

      await sync.beforeRequest();

      expect(store.puts).toEqual([`put If-Match ${first}`]);
      expect(sync.db().prepare("SELECT name FROM sqlite_master WHERE name = 'extra'").get()).toBeDefined();
      const path = join(root, "migrated.db");
      writeFileSync(path, store.object!.body);
      const stored = new DatabaseSync(path, { readOnly: true });
      expect(stored.prepare("SELECT name FROM sqlite_master WHERE name = 'extra'").get()).toBeDefined();
      stored.close();
      expect(existsSync(join(root, "backups"))).toBe(false);
    });

    it("uploads nothing when the stored file is already current", async () => {
      store.replace(databaseBytes());
      await newSync().beforeRequest();
      expect(store.puts).toEqual([]);
    });
  });

  it("publishes itself for getDb", () => {
    const sync = newSync();
    expect(sharedSync()).toBeUndefined();
    shareSync(sync);
    expect(sharedSync()).toBe(sync);
  });
});

describe("serveWithSync", () => {
  let server: Server;
  let url: string;

  async function start(handler: Parameters<typeof serveWithSync>[0], sync: S3Sync): Promise<void> {
    vi.spyOn(console, "error").mockImplementation(() => {});
    server = createServer(serveWithSync(handler, sync));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  afterEach(async () => {
    server?.closeAllConnections();
    await new Promise((resolve) => server?.close(resolve));
  });

  /** A handler like the app's: GET reads, POST adds an album. */
  function appHandler(sync: S3Sync): Parameters<typeof serveWithSync>[0] {
    return (req, res) => {
      if (req.method === "POST") addAlbum(sync.db(), `Album ${Math.random()}`);
      res.statusCode = 200;
      res.setHeader("content-type", "text/plain");
      res.write("part one, ");
      res.end("part two");
    };
  }

  it("sends the response only after the upload has finished", async () => {
    store.replace(databaseBytes());
    let release!: () => void;
    store.gate = new Promise((resolve) => (release = resolve));
    const putStarted = new Promise<void>((resolve) => (store.onPut = resolve));
    const sync = newSync();
    await start(appHandler(sync), sync);

    let received = false;
    const pending = fetch(url, { method: "POST" }).then(async (response) => {
      received = true;
      return { status: response.status, body: await response.text() };
    });
    await putStarted;
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(received).toBe(false);
    release();

    expect(await pending).toEqual({ status: 200, body: "part one, part two" });
    expect(store.puts).toHaveLength(1);
  });

  it("passes a read-only request through without an upload", async () => {
    store.replace(databaseBytes());
    const sync = newSync();
    await start(appHandler(sync), sync);

    const response = await fetch(url);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain");
    expect(await response.text()).toBe("part one, part two");
    expect(store.puts).toEqual([]);
  });

  it("keeps the status and headers a handler sets with writeHead", async () => {
    store.replace(databaseBytes());
    const sync = newSync();
    await start((_req, res) => {
      res.writeHead(201, { "content-type": "application/json", "x-test": "yes" });
      res.end('{"ok":true}');
    }, sync);

    const response = await fetch(url);

    expect(response.status).toBe(201);
    expect(response.headers.get("x-test")).toBe("yes");
    expect(await response.json()).toEqual({ ok: true });
  });

  it("answers 503 and discards the app's response when the write fails, then serves the stored version", async () => {
    store.replace(databaseBytes());
    const sync = newSync();
    let calls = 0;
    await start((_req, res) => {
      if (++calls === 1) {
        addAlbum(sync.db(), "Racing write");
        store.replace(databaseBytes((db) => addAlbum(db, "Other writer"))); // another writer lands during the request
      }
      res.end("app says ok");
    }, sync);

    const failed = await fetch(url, { method: "POST" });
    const body = await failed.text();

    expect(failed.status).toBe(503);
    expect(body).not.toContain("app says ok");
    expect(body).toMatch(/not saved/);
    expect(failed.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(storedTitles()).toEqual(["Other writer"]);
    expect(() => sync.db()).toThrow(/not loaded/);

    const next = await fetch(url);
    expect(next.status).toBe(200);
    expect(albumTitles(sync.db())).toEqual(["Other writer"]);
  });

  it("serves an error page and leaves S3 alone when the stored file is invalid", async () => {
    const junk = new TextEncoder().encode("junk".repeat(50));
    const etag = store.replace(junk);
    const sync = newSync();
    let ran = false;
    await start((_req, res) => {
      ran = true;
      res.end("app");
    }, sync);

    const response = await fetch(url);
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(body).toMatch(/stored database can't be opened/);
    expect(ran).toBe(false);
    expect(store.object).toEqual({ body: junk, etag });
    expect(store.puts).toEqual([]);
  });

  it("answers 503 when S3 can't be reached, and keeps trying on the next request", async () => {
    store.replace(databaseBytes());
    const sync = newSync();
    await start(appHandler(sync), sync);
    const head = vi.spyOn(store, "head").mockRejectedValueOnce(new Error("timeout"));

    expect((await fetch(url)).status).toBe(503);
    expect((await fetch(url)).status).toBe(200);
    expect(head).toHaveBeenCalledTimes(2);
  });

  it("runs one request at a time", async () => {
    store.replace(databaseBytes());
    const sync = newSync();
    const events: string[] = [];
    await start(async (req, res) => {
      const id = req.url;
      events.push(`start ${id}`);
      await new Promise((resolve) => setTimeout(resolve, 50));
      events.push(`end ${id}`);
      res.end(id);
    }, sync);

    await Promise.all([fetch(`${url}/a`), fetch(`${url}/b`), fetch(`${url}/c`)]);

    const order = events.filter((event) => event.startsWith("start")).map((event) => event.slice(6));
    expect(events).toEqual(order.flatMap((id) => [`start ${id}`, `end ${id}`]));
    expect(order).toHaveLength(3);
  });

  it("answers 500 when the app throws, still saving what it changed", async () => {
    store.replace(databaseBytes());
    const sync = newSync();
    await start(() => {
      addAlbum(sync.db(), "Half done");
      throw new Error("boom");
    }, sync);

    const response = await fetch(url, { method: "POST" });

    expect(response.status).toBe(500);
    expect(storedTitles()).toEqual(["Half done"]);
  });
});
