// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pkg = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { scripts: Record<string, string> };

const cases = [
  { script: "dev", command: "next dev" },
  { script: "start", command: "next start" },
];

describe("package.json scripts bind to loopback", () => {
  it.each(cases)("$script passes --hostname 127.0.0.1 to $command", ({ script, command }) => {
    expect(pkg.scripts[script]).toContain(command);
    expect(pkg.scripts[script]).toContain("--hostname 127.0.0.1");
  });
});
