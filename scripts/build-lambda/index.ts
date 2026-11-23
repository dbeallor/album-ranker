import { execFileSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildEventsPackage } from "./events-package.ts";
import { collectSources, packageClosure } from "./files.ts";

// `npm run build:lambda`: builds Next.js and assembles what Terraform ships, in dist/ (see infra/modules/app).
//   dist/lambda        the Lambda package: Next.js standalone server, the S3 sync entry, run.sh for the Web Adapter
//   dist/events        the events Lambda function (handler lambda/events.handler), transpiled to JavaScript
//   dist/static        the files for /_next/static, uploaded to the assets bucket
//   dist/build-info.json  the commit the build came from

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIST = join(ROOT, "dist");
const LAMBDA = join(DIST, "lambda");
const EVENTS = join(DIST, "events");
const ENTRY = "lambda/server.ts";
const MIGRATIONS = "lib/db/migrations";

// What the standalone output keeps. The rest of it is traced source folders that run nothing, and sharp with its
// platform binary (built for this machine, not Lambda), which only next/image uses.
const KEEP_FROM_STANDALONE = [".next", "node_modules", "package.json", "server.js"];
const DROP_FROM_STANDALONE_MODULES = ["@img", "sharp"];

const RUN_SH = `#!/bin/sh
# The Lambda handler: the Lambda Web Adapter layer (AWS_LAMBDA_EXEC_WRAPPER=/opt/bootstrap) runs this as the web server.
cd "$(dirname "$0")"
exec node lambda/server.ts
`;

function git(...args: string[]): string {
  return execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8" }).trim();
}

function copyPackageFolder(from: string, to: string): void {
  // Nested installs are separate entries in the closure; type declarations are not needed to run.
  // force: a folder Next.js already traced may be partial, so merge over it.
  cpSync(from, to, { recursive: true, force: true, filter: (source) => !["node_modules", "dist-types"].includes(basename(source)) });
}

/** The environment for `next build`: switches on front-end event capture (components/client-events.tsx), which no other build or run has. */
export function nextBuildEnv(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return { ...base, NEXT_PUBLIC_CLIENT_EVENTS: "1" };
}

export function main(): void {
  rmSync(DIST, { recursive: true, force: true });

  console.log("Building Next.js (standalone output)...");
  execFileSync(join(ROOT, "node_modules", ".bin", "next"), ["build"], { cwd: ROOT, stdio: "inherit", env: nextBuildEnv(process.env) });
  const standalone = join(ROOT, ".next", "standalone");
  if (!existsSync(join(standalone, "server.js"))) {
    throw new Error('.next/standalone/server.js is missing. Check that next.config.ts sets output: "standalone".');
  }

  mkdirSync(LAMBDA, { recursive: true });
  for (const name of KEEP_FROM_STANDALONE) cpSync(join(standalone, name), join(LAMBDA, name), { recursive: true });
  for (const name of DROP_FROM_STANDALONE_MODULES) rmSync(join(LAMBDA, "node_modules", name), { recursive: true, force: true });

  // Static files go to S3 behind CloudFront, so the function doesn't carry them.
  cpSync(join(ROOT, ".next", "static"), join(DIST, "static"), { recursive: true });
  rmSync(join(LAMBDA, ".next", "static"), { recursive: true, force: true });

  // The sync entry and the files it imports, as TypeScript for Node's type stripping (see lambda/server.ts).
  const { files, packages } = collectSources(ROOT, ENTRY);
  for (const file of files) {
    mkdirSync(dirname(join(LAMBDA, file)), { recursive: true });
    cpSync(join(ROOT, file), join(LAMBDA, file));
  }
  mkdirSync(join(LAMBDA, MIGRATIONS), { recursive: true });
  for (const name of readdirSync(join(ROOT, MIGRATIONS)).filter((file) => file.endsWith(".sql"))) {
    cpSync(join(ROOT, MIGRATIONS, name), join(LAMBDA, MIGRATIONS, name));
  }

  // Next.js tracing leaves out what only lambda/server.ts imports (@aws-sdk/client-s3 and what it needs).
  for (const dir of packageClosure(ROOT, packages)) {
    copyPackageFolder(join(ROOT, dir), join(LAMBDA, dir));
  }

  // server.js is CommonJS and sits under the root package.json (no "type"), so the TypeScript folders get their own
  // package.json saying "module", which keeps Node from guessing and warning.
  for (const dir of new Set(files.map((file) => dirname(file)))) {
    writeFileSync(join(LAMBDA, dir, "package.json"), '{ "type": "module" }\n');
  }

  // The events function (ALBUM-85) is its own Lambda function, so it gets its own folder, as JavaScript.
  const eventsFiles = buildEventsPackage(ROOT, EVENTS);

  writeFileSync(join(LAMBDA, "run.sh"), RUN_SH);
  chmodSync(join(LAMBDA, "run.sh"), 0o755);

  const dirty = git("status", "--porcelain", "--untracked-files=no") !== "";
  const buildInfo = { commit: git("rev-parse", "HEAD"), dirty, builtAt: new Date().toISOString() };
  writeFileSync(join(DIST, "build-info.json"), `${JSON.stringify(buildInfo, null, 2)}\n`);

  console.log(`Built dist/lambda (${files.length} source files, ${packages.join(", ") || "no extra packages"}), dist/events (${eventsFiles.length} files), dist/static and dist/build-info.json for ${buildInfo.commit}${dirty ? " (with uncommitted changes)" : ""}.`);
}
