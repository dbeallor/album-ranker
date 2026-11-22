import { existsSync, readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";

// Which files the packaged server needs besides what Next.js traces. Pure file reading, no copying: see index.ts.

const IMPORT_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["']([^"']+)["']/g;

/** Every module specifier a source file imports (static `from`, side-effect `import "x"`, and `import("x")` with a string). */
export function importSpecifiers(source: string): string[] {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  return [...withoutComments.matchAll(IMPORT_SPECIFIER)].map((match) => match[1] as string);
}

/** The package a bare specifier names: `@aws-sdk/client-s3/x` is `@aws-sdk/client-s3`. Null for built-ins and relative paths. */
export function packageOf(specifier: string): string | null {
  if (specifier.startsWith(".") || specifier.startsWith("/") || specifier.startsWith("node:")) return null;
  if (builtinModules.includes(specifier.split("/")[0] as string)) return null;
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : (parts[0] as string);
}

export type SourceGraph = {
  /** Source files under `root`, as paths relative to it, entry first then in the order found. */
  files: string[];
  /** Packages the files import by name. */
  packages: string[];
};

/**
 * Follows relative imports from `entry` (a path relative to `root`). Node strips types only from files that are not
 * under node_modules, and only when the import names the real `.ts` file, so a relative import without the
 * extension, or of a file that isn't there, is an error here rather than a crash on Lambda.
 */
export function collectSources(root: string, entry: string): SourceGraph {
  const files: string[] = [];
  const packages = new Set<string>();
  const queue = [entry];
  const seen = new Set<string>(queue);

  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    files.push(next);
    for (const specifier of importSpecifiers(readFileSync(join(root, next), "utf8"))) {
      const name = packageOf(specifier);
      if (name !== null) {
        packages.add(name);
        continue;
      }
      if (!specifier.startsWith(".")) continue;
      if (!specifier.endsWith(".ts")) {
        throw new Error(`${next} imports "${specifier}". The packaged server runs TypeScript as is, so write the .ts extension.`);
      }
      const target = relative(root, resolve(root, dirname(next), specifier)).split(sep).join("/");
      if (!existsSync(join(root, target))) throw new Error(`${next} imports "${specifier}", but ${target} does not exist.`);
      if (!seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
  return { files, packages: [...packages].sort() };
}

type PackageJson = { dependencies?: Record<string, string>; optionalDependencies?: Record<string, string> };

/** Where `name` is installed when looked up from `fromDir` (a package folder or the project root), as Node would. */
function findPackage(name: string, fromDir: string, root: string): string | null {
  for (let dir = fromDir; ; dir = dirname(dir)) {
    const candidate = join(dir, "node_modules", name);
    if (existsSync(join(candidate, "package.json"))) return candidate;
    if (dir === root || dirname(dir) === dir) return null;
  }
}

/**
 * The folders of the named packages and everything they depend on at run time, as paths relative to `root`, found the way
 * Node resolves them (a nested `node_modules` wins over the top level one). Missing optional dependencies are skipped.
 */
export function packageClosure(root: string, names: string[]): string[] {
  const found = new Set<string>();
  const queue: Array<{ name: string; from: string; optional: boolean }> = names.map((name) => ({ name, from: root, optional: false }));

  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    const dir = findPackage(next.name, next.from, root);
    if (dir === null) {
      if (next.optional) continue;
      throw new Error(`Package ${next.name} is not installed (needed from ${relative(root, next.from) || "the project root"}). Run npm ci.`);
    }
    if (found.has(dir)) continue;
    found.add(dir);
    const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as PackageJson;
    for (const dep of Object.keys(manifest.dependencies ?? {})) queue.push({ name: dep, from: dir, optional: false });
    for (const dep of Object.keys(manifest.optionalDependencies ?? {})) queue.push({ name: dep, from: dir, optional: true });
  }
  return [...found].map((dir) => relative(root, dir).split(sep).join("/")).sort();
}
