// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** Every exported server action starts with `await requireSession()`; the proxy alone can stop covering a moved route. */

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
/** The login action is how a session starts, so it can't require one. */
const EXEMPT = ["app/login/actions.ts"];

function listFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

/** Exported functions that don't start with the session check. */
function unguarded(text: string): string[] {
  return [...text.matchAll(/export (?:async )?function (\w+)[^{]*\{\s*(await requireSession\(\);)?/g)]
    .filter(([, , guard]) => !guard)
    .map(([, name]) => name);
}

const files = listFiles("app")
  .map((path) => path.split(sep).join("/"))
  .filter((path) => path.endsWith("/actions.ts") && !EXEMPT.includes(path));

describe("server actions require a session", () => {
  it("finds the action files", () => {
    expect(files.length).toBeGreaterThanOrEqual(4);
  });

  it.each(files)("%s", (path) => {
    expect(unguarded(readFileSync(join(ROOT, path), "utf8"))).toEqual([]);
  });

  it.each([
    { name: "an action with the check", text: "export async function a() {\n  await requireSession();\n  return 1;\n}", expected: [] },
    { name: "an action without it", text: "export async function a(x: number) {\n  return 1;\n}", expected: ["a"] },
    { name: "the check after other work", text: "export async function a() {\n  doIt();\n  await requireSession();\n}", expected: ["a"] },
  ])("detects: $name", ({ text, expected }) => {
    expect(unguarded(text)).toEqual(expected);
  });
});
