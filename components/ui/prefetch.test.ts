// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The app runs as one server copy that takes one request at a time, so a page load must not fan out into
 * prefetch requests. Every `<Link>` in app/ and components/ says `prefetch={false}`.
 */

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

function listFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

/** The text of every `<Link ...>` opening tag: from `<Link` to the first `>` outside braces and strings. */
function linkTags(text: string): string[] {
  const tags: string[] = [];
  for (const match of text.matchAll(/<Link(?=[\s/>])/g)) {
    let depth = 0;
    let quote = "";
    let end = match.index;
    for (; end < text.length; end++) {
      const char = text[end];
      if (quote) {
        if (char === quote) quote = "";
      } else if (char === '"' || char === "'" || char === "`") quote = char;
      else if (char === "{") depth++;
      else if (char === "}") depth--;
      else if (char === ">" && depth === 0 && text[end - 1] !== "=") break;
    }
    tags.push(text.slice(match.index, end + 1));
  }
  return tags;
}

const missingPrefetch = (text: string) => linkTags(text).filter((tag) => !/\bprefetch=\{false\}/.test(tag));

const sources = ["app", "components"]
  .flatMap(listFiles)
  .map((path) => path.split(sep).join("/"))
  .filter((path) => path.endsWith(".tsx") && !path.endsWith(".test.tsx"))
  .map((path) => ({ path, text: readFileSync(join(ROOT, path), "utf8") }));

describe("links don't prefetch", () => {
  it("finds the links to check", () => {
    expect(sources.flatMap(({ text }) => linkTags(text)).length).toBeGreaterThanOrEqual(10);
  });

  it.each(sources.filter(({ text }) => text.includes("<Link")))("every Link in $path sets prefetch={false}", ({ text }) => {
    expect(missingPrefetch(text)).toEqual([]);
  });

  // The check must actually catch a missing prop, or the scan above proves nothing.
  it.each([
    { name: "a plain link", text: '<Link href="/a">A</Link>', missing: 1 },
    { name: "a link whose href holds an arrow function", text: '<Link href={items.map((i) => i.href)[0]}>A</Link>', missing: 1 },
    { name: "a multi-line link without it", text: "<Link\n  href={x}\n  className={y}\n>A</Link>", missing: 1 },
    { name: "a link with it", text: '<Link href="/a" prefetch={false}>A</Link>', missing: 0 },
    { name: "a multi-line link with it", text: "<Link\n  prefetch={false}\n  href={x}\n>A</Link>", missing: 0 },
    { name: "prefetch left on", text: '<Link href="/a" prefetch>A</Link>', missing: 1 },
    { name: "a ButtonLink is not a Link", text: '<ButtonLink href="/a">A</ButtonLink>', missing: 0 },
  ])("detects: $name", ({ text, missing }) => {
    expect(missingPrefetch(text)).toHaveLength(missing);
  });
});
