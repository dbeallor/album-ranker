import type { DatabaseSync } from "node:sqlite";
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { inspectBackup } from "./backup.ts";
import { openDatabase } from "./connection.ts";

/**
 * S3 storage mode: the database is one SQLite file in a versioned S3 object, and the server works on a copy in `/tmp`.
 *
 * How the pieces share one connection. `DatabaseSync` is synchronous but S3 is not, so the sync work has to happen
 * outside the app's code, around each request:
 *
 * - `lambda/server.ts` (the wrapper) creates the one `S3Sync`, publishes it on `globalThis` (`shareSync`) and then starts the
 *   Next.js standalone server in the same process, with its request listener wrapped by `serveWithSync`.
 * - Before each request the wrapper calls `beforeRequest()`: one HEAD, and a reload of the local copy if the ETag changed.
 * - The app opens nothing in this mode. `getDb()` in `lib/db/server.ts` returns the connection the `S3Sync` owns, found
 *   through `globalThis` under a `Symbol.for` key, which works across Next's own module graph and the wrapper's. The
 *   wrapper therefore never opens a second connection and never closes the app's: the one connection is replaced only
 *   between requests, when the file is reloaded or dropped, and `getDb()` looks it up on every call.
 * - After the app has produced a response, but before it is sent, the wrapper calls `afterRequest()`. If the database
 *   changed, it uploads a `VACUUM INTO` copy with a conditional write; if that fails, the response becomes a 503.
 *
 * Change detection uses `total_changes()` on that one connection, not `PRAGMA data_version`: data_version only changes for
 * commits made by other connections, so it never moves for this connection's own writes. Rolled-back writes also count,
 * which only costs a needless upload.
 */

export type StoredObject = { body: Uint8Array; etag: string };

/** `ifMatch`: replace only if the stored ETag still is this. `ifNoneMatch: "*"`: create only if nothing is stored. */
export type PutCondition = { ifMatch: string } | { ifNoneMatch: "*" };

/** The three S3 calls the sync needs, for one bucket and key. The AWS-backed version is in `s3-store.ts`; tests use a fake. */
export interface ObjectStore {
  /** The stored object's ETag, or null when there is no object. */
  head(): Promise<{ etag: string } | null>;
  /** The stored object, or null when there is none. */
  get(): Promise<StoredObject | null>;
  /** Writes the object if `condition` holds; throws `ConditionFailedError` when it doesn't. */
  put(body: Uint8Array, condition: PutCondition): Promise<{ etag: string }>;
}

/** The object changed (or appeared) since this copy read it. */
export class ConditionFailedError extends Error {
  constructor(message = "The stored database changed since this copy was read.") {
    super(message);
    this.name = "ConditionFailedError";
  }
}

/** The stored object is not an album-ranker database. Nothing in S3 was changed. */
export class StoredDatabaseError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "StoredDatabaseError";
  }
}

export type S3SyncOptions = {
  store: ObjectStore;
  /** The working copy, in `/tmp` on Lambda. */
  path: string;
  /** Folder of migration files. Defaults to `lib/db/migrations` under the working directory. */
  migrationsDir?: string;
  log?: (message: string) => void;
};

export type S3Sync = {
  /** Call before each request: loads or reloads the local copy when the stored ETag differs. */
  beforeRequest(): Promise<void>;
  /** Call once the app has its response, before it is sent: uploads if the database changed. On failure the local copy is dropped and this throws. */
  afterRequest(): Promise<void>;
  /** The connection the app uses. Throws when nothing is loaded. */
  db(): DatabaseSync;
};

const SHARED = Symbol.for("album-ranker.s3-sync");

/** Publishes `sync` for `getDb()`, which runs in Next's own module graph. */
export function shareSync(sync: S3Sync | undefined): void {
  (globalThis as Record<symbol, unknown>)[SHARED] = sync;
}

export function sharedSync(): S3Sync | undefined {
  return (globalThis as Record<symbol, unknown>)[SHARED] as S3Sync | undefined;
}

function removeDbFiles(path: string): void {
  for (const suffix of ["", "-wal", "-shm"]) rmSync(path + suffix, { force: true });
}

function totalChanges(db: DatabaseSync): number {
  return Number(db.prepare("SELECT total_changes() AS n").get()?.n ?? 0);
}

function migrationCount(path: string): number {
  return inspectBackup(path).length;
}

export function createS3Sync(options: S3SyncOptions): S3Sync {
  const { store, path, migrationsDir } = options;
  const log = options.log ?? ((message: string) => console.log(`[s3-sync] ${message}`));

  let db: DatabaseSync | undefined;
  /** The ETag of the stored object the local copy matches. */
  let etag: string | undefined;
  /** `total_changes()` at the last load or upload; a higher number means unsaved changes. */
  let savedChanges = 0;
  /** A stored object known not to be a database, so the same bytes aren't downloaded again on every request. */
  let rejected: { etag: string; reason: string } | undefined;

  function drop(): void {
    if (db?.isOpen) db.close();
    db = undefined;
    etag = undefined;
    savedChanges = 0;
    removeDbFiles(path);
  }

  function open(): DatabaseSync {
    const opened = openDatabase(path, { skipBackup: true, migrationsDir });
    db = opened;
    savedChanges = totalChanges(opened);
    return opened;
  }

  /** Writes a clean single-file copy of the open database and returns its bytes. */
  function snapshot(source: DatabaseSync): Uint8Array {
    const temp = `${path}.upload-${randomBytes(6).toString("hex")}`;
    try {
      source.prepare("VACUUM INTO ?").run(temp);
      return readFileSync(temp);
    } finally {
      rmSync(temp, { force: true });
    }
  }

  /** Uploads the local database. Any failure drops the local copy so the next request reloads what S3 holds. */
  async function upload(condition: PutCondition): Promise<void> {
    if (!db) throw new Error("No database is loaded.");
    try {
      const result = await store.put(snapshot(db), condition);
      etag = result.etag;
      savedChanges = totalChanges(db);
    } catch (error) {
      log(`Upload failed, dropping the local copy: ${error instanceof Error ? error.message : error}`);
      drop();
      throw error;
    }
  }

  async function createFresh(): Promise<void> {
    log("No stored database. Creating an empty one.");
    drop();
    mkdirSync(dirname(path), { recursive: true });
    open();
    await upload({ ifNoneMatch: "*" });
  }

  async function download(): Promise<void> {
    const object = await store.get();
    if (!object) return createFresh();

    mkdirSync(dirname(path), { recursive: true });
    const temp = `${path}.download-${randomBytes(6).toString("hex")}`;
    writeFileSync(temp, object.body, { mode: 0o600 });
    let before: number;
    try {
      before = migrationCount(temp);
    } catch (error) {
      rmSync(temp, { force: true });
      const reason = error instanceof Error ? error.message.replaceAll(temp, "the stored file") : String(error);
      rejected = { etag: object.etag, reason };
      log(`The stored database can't be opened, S3 left untouched: ${reason}`);
      throw new StoredDatabaseError(reason, { cause: error });
    }
    drop();
    renameSync(temp, path);
    rejected = undefined;
    etag = object.etag;
    const opened = open();
    log(`Loaded the stored database (${object.body.byteLength} bytes).`);
    const after = Number(opened.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get()?.n ?? 0);
    // Opening applies pending migrations, which change the schema but not `total_changes()`: upload them now.
    if (after > before) await upload({ ifMatch: object.etag });
  }

  return {
    async beforeRequest() {
      const head = await store.head();
      if (head && db && head.etag === etag) return;
      if (head && rejected?.etag === head.etag) throw new StoredDatabaseError(rejected.reason);
      if (head && db) log("The stored database changed. Reloading.");
      if (head) await download();
      else {
        if (db) console.error("[s3-sync] The stored database object vanished while a copy was loaded. Creating a new empty one.");
        await createFresh();
      }
    },

    async afterRequest() {
      if (!db || etag === undefined) return;
      if (totalChanges(db) === savedChanges) return;
      await upload({ ifMatch: etag });
    },

    db() {
      if (!db) throw new Error("The database is not loaded. S3 storage mode loads it before each request.");
      return db;
    },
  };
}

type Listener = (req: IncomingMessage, res: ServerResponse) => unknown;

/** Replaces whatever the handler had set up with a plain error response. */
function sendError(res: ServerResponse, status: number, title: string, detail: string): void {
  if (res.headersSent || res.writableEnded) {
    res.destroy();
    return;
  }
  for (const name of res.getHeaderNames()) res.removeHeader(name);
  res.statusCode = status;
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.setHeader("x-robots-tag", "noindex, nofollow");
  res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${title}</h1><p>${detail}</p></body></html>`);
}

type Patchable = {
  writeHead: (...args: unknown[]) => unknown;
  write: (chunk: unknown, ...rest: unknown[]) => boolean;
  end: (chunk?: unknown, ...rest: unknown[]) => unknown;
  flushHeaders: () => void;
};

/**
 * Runs `listener` for one request but holds back everything it writes until `beforeSend` has finished.
 * Resolves once the response has been sent (or its connection closed). If `beforeSend` throws, the held response
 * is dropped and `onFailure` writes a replacement.
 */
function runHeld(listener: Listener, req: IncomingMessage, res: ServerResponse, beforeSend: () => Promise<void>, onFailure: (error: unknown) => void): Promise<void> {
  return new Promise<void>((resolve) => {
    const target = res as unknown as Patchable;
    let head: unknown[] | undefined;
    const chunks: Buffer[] = [];
    let endCallback: (() => void) | undefined;
    let ended = false;
    let finished = false;
    let settled = false;

    const toBuffer = (chunk: unknown, encoding: unknown): Buffer =>
      typeof chunk === "string" ? Buffer.from(chunk, typeof encoding === "string" ? (encoding as BufferEncoding) : "utf8") : Buffer.from(chunk as Uint8Array);
    const callbackOf = (args: unknown[]): (() => void) | undefined => args.find((arg) => typeof arg === "function") as (() => void) | undefined;

    async function finish(): Promise<void> {
      if (finished) return;
      finished = true;
      let failure: { error: unknown } | undefined;
      try {
        await beforeSend();
      } catch (error) {
        failure = { error };
      }
      for (const name of ["writeHead", "write", "end", "flushHeaders"]) Reflect.deleteProperty(res, name);
      if (res.destroyed) {
        resolve();
        return;
      }
      res.once("close", () => resolve());
      if (failure) {
        onFailure(failure.error);
        return;
      }
      if (head) (res.writeHead as (...args: unknown[]) => unknown)(...head);
      for (const chunk of chunks) res.write(chunk);
      res.end(endCallback);
    }

    target.writeHead = (...args) => {
      head = args;
      return res;
    };
    target.flushHeaders = () => {};
    target.write = (chunk, ...rest) => {
      chunks.push(toBuffer(chunk, rest[0]));
      callbackOf(rest)?.();
      return true;
    };
    target.end = (chunk, ...rest) => {
      if (ended) return res;
      ended = true;
      if (chunk !== undefined && chunk !== null && typeof chunk !== "function") chunks.push(toBuffer(chunk, rest[0]));
      endCallback = callbackOf([chunk, ...rest]);
      void finish();
      return res;
    };

    // A client that hangs up before the handler ends still gets its changes saved, once the handler is done.
    const maybeFinish = () => {
      if (!ended && settled && res.destroyed) {
        ended = true;
        void finish();
      }
    };
    res.once("close", maybeFinish);

    Promise.resolve()
      .then(() => listener(req, res))
      .catch((error: unknown) => {
        console.error("Request failed:", error);
        if (!ended) {
          for (const name of res.getHeaderNames()) res.removeHeader(name);
          head = undefined;
          chunks.length = 0;
          res.statusCode = 500;
          res.setHeader("content-type", "text/plain; charset=utf-8");
          target.end("Internal Server Error");
        }
      })
      .finally(() => {
        settled = true;
        maybeFinish();
      });
  });
}

const turnHeader = "x-album-ranker-sync-turn";

function isLiveToken(header: string | string[] | undefined, live: string | undefined): boolean {
  if (typeof header !== "string" || live === undefined || header.length !== live.length) return false;
  return timingSafeEqual(Buffer.from(header), Buffer.from(live));
}

/**
 * Wraps a Node request listener (Next.js's) so each outside request runs alone, with the stored database current when
 * it starts and saved before its response goes out. A request that can't have its database loaded gets an error page;
 * one whose changes can't be saved gets a 503 and the app's response is discarded.
 *
 * The request holding the turn carries a per-turn token in `x-album-ranker-sync-turn`, which Next copies into the
 * requests it makes to itself (the redirect render of a server action). Those requests run at once inside the turn,
 * with no load, save or hold of their own: the outer request's save covers them. Any other value of the header is
 * dropped and the request queues.
 */
export function serveWithSync(listener: Listener, sync: Pick<S3Sync, "beforeRequest" | "afterRequest">): Listener {
  let tail: Promise<unknown> = Promise.resolve();
  let live: string | undefined;
  return (req, res) => {
    if (isLiveToken(req.headers[turnHeader], live)) return Promise.resolve().then(() => listener(req, res));
    delete req.headers[turnHeader];
    const turn = tail.then(async () => {
      live = randomBytes(32).toString("hex");
      req.headers[turnHeader] = live;
      try {
        try {
          await sync.beforeRequest();
        } catch (error) {
          if (error instanceof StoredDatabaseError) {
            console.error("[s3-sync] Stored database can't be opened:", error.message);
            sendError(res, 500, "The stored database can't be opened", "The database file in storage is not a usable album-ranker database. Nothing was changed. Restore a good copy and reload.");
          } else {
            console.error("[s3-sync] Loading the database failed:", error);
            sendError(res, 503, "The database is unavailable", "Loading the database from storage failed. Reload to try again.");
          }
          return;
        }
        await runHeld(listener, req, res, () => sync.afterRequest(), (error) => {
          console.error("[s3-sync] Saving the database failed:", error);
          sendError(res, 503, "Your change was not saved", "Saving to storage failed, so nothing changed. Reload and try again.");
        });
      } finally {
        live = undefined;
      }
    });
    tail = turn.catch(() => {});
    return turn;
  };
}
