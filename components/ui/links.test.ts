// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { NAV_ITEMS } from "./site-header";

/** Guards against a nav or home page link that points at a page that is gone. */

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

function hasRoute(href: string): boolean {
  const path = href.split(/[?#]/)[0].replace(/^\/|\/$/g, "");
  return existsSync(join(ROOT, "app", path, "page.tsx"));
}

const homeHrefs = [...readFileSync(join(ROOT, "app/page.tsx"), "utf8").matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1]);

describe("internal links", () => {
  it.each([
    ...NAV_ITEMS.map((item) => ({ from: "the nav", href: item.href as string })),
    ...homeHrefs.map((href) => ({ from: "the home page", href })),
  ])("$href from $from has a page", ({ href }) => {
    expect(hasRoute(href)).toBe(true);
  });

  it("finds the home page links to check", () => {
    expect(homeHrefs.length).toBeGreaterThanOrEqual(4);
  });
});
