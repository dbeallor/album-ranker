import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { collectSources, importSpecifiers, packageClosure, packageOf } from "./files.ts";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "build-lambda-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function write(path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

function pkg(path: string, dependencies: Record<string, string> = {}, optionalDependencies: Record<string, string> = {}): void {
  write(join(path, "package.json"), JSON.stringify({ dependencies, optionalDependencies }));
}

describe("importSpecifiers", () => {
  it.each([
    ['import a from "./a.ts";', ["./a.ts"]],
    ['import { b, type C } from "../b.ts";', ["../b.ts"]],
    ['import type { D } from "./d.ts";', ["./d.ts"]],
    ['import "./side.ts";', ["./side.ts"]],
    ['const x = await import(new URL("./a", base));', []],
    ['await import("./lazy.ts");', ["./lazy.ts"]],
    ['export { e } from "./e.ts";', ["./e.ts"]],
    ['// import x from "./commented.ts"\nimport y from "./y.ts";', ["./y.ts"]],
    ['/* import x from "./commented.ts" */ import y from "./y.ts";', ["./y.ts"]],
    ['import { S3Client } from "@aws-sdk/client-s3";\nimport { x } from "node:fs";', ["@aws-sdk/client-s3", "node:fs"]],
  ])("%s", (source, expected) => {
    expect(importSpecifiers(source)).toEqual(expected);
  });
});

describe("packageOf", () => {
  it.each([
    ["@aws-sdk/client-s3", "@aws-sdk/client-s3"],
    ["@aws-sdk/client-s3/dist/x.js", "@aws-sdk/client-s3"],
    ["next/server", "next"],
    ["react", "react"],
    ["node:fs", null],
    ["fs", null],
    ["fs/promises", null],
    ["./a.ts", null],
    ["../b.ts", null],
  ])("%s", (specifier, expected) => {
    expect(packageOf(specifier)).toBe(expected);
  });
});

describe("collectSources", () => {
  it("follows relative imports once each, in order found, and lists the packages", () => {
    write("lambda/server.ts", 'import { a } from "../lib/a.ts";\nimport { b } from "../lib/b.ts";\nimport "node:http";');
    write("lib/a.ts", 'import { b } from "./b.ts";\nimport { S3Client } from "@aws-sdk/client-s3";');
    write("lib/b.ts", 'import { readFileSync } from "node:fs";\nimport { a } from "./a.ts";');
    write("lib/unused.ts", "export {};");
    expect(collectSources(root, "lambda/server.ts")).toEqual({
      files: ["lambda/server.ts", "lib/a.ts", "lib/b.ts"],
      packages: ["@aws-sdk/client-s3"],
    });
  });

  it("refuses a relative import without the .ts extension", () => {
    write("lambda/server.ts", 'import { a } from "../lib/a";');
    expect(() => collectSources(root, "lambda/server.ts")).toThrow(/write the \.ts extension/);
  });

  it("refuses an import of a file that is not there", () => {
    write("lambda/server.ts", 'import { a } from "../lib/missing.ts";');
    expect(() => collectSources(root, "lambda/server.ts")).toThrow(/lib\/missing\.ts does not exist/);
  });

  it("covers the real entry: every file it needs, and only @aws-sdk/client-s3 from outside", () => {
    const repo = join(import.meta.dirname, "..", "..");
    const { files, packages } = collectSources(repo, "lambda/server.ts");
    expect(files).toEqual(
      expect.arrayContaining(["lambda/server.ts", "lib/config.ts", "lib/db/s3-sync.ts", "lib/db/s3-store.ts", "lib/db/connection.ts", "lib/db/backup.ts", "lib/db/migrate.ts"]),
    );
    expect(packages).toEqual(["@aws-sdk/client-s3"]);
  });
});

describe("packageClosure", () => {
  it("follows dependencies and optional dependencies that are installed", () => {
    pkg("node_modules/a", { b: "1" }, { c: "1", missing: "1" });
    pkg("node_modules/b");
    pkg("node_modules/c", { b: "1" });
    pkg("node_modules/unrelated");
    expect(packageClosure(root, ["a"])).toEqual(["node_modules/a", "node_modules/b", "node_modules/c"]);
  });

  it("prefers a nested install over the top level one, as Node does", () => {
    pkg("node_modules/a", { b: "2" });
    pkg("node_modules/a/node_modules/b");
    pkg("node_modules/b");
    expect(packageClosure(root, ["a"])).toEqual(["node_modules/a", "node_modules/a/node_modules/b"]);
  });

  it("handles scoped packages and cycles", () => {
    pkg("node_modules/@s/a", { "@s/b": "1" });
    pkg("node_modules/@s/b", { "@s/a": "1" });
    expect(packageClosure(root, ["@s/a"])).toEqual(["node_modules/@s/a", "node_modules/@s/b"]);
  });

  it("names a required package that is not installed", () => {
    pkg("node_modules/a", { gone: "1" });
    expect(() => packageClosure(root, ["a"])).toThrow(/Package gone is not installed/);
  });
});
