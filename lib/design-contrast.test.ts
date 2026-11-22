// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** Text must stay readable in both themes: every text and background token pair is at least WCAG AA (4.5:1). */

const CSS = readFileSync(fileURLToPath(new URL("../app/globals.css", import.meta.url)), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function declarations(block: string): Record<string, string> {
  return Object.fromEntries([...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

const light = declarations(CSS.match(/^:root\s*\{([^}]*)\}/m)?.[1] ?? "");
const dark = { ...light, ...declarations(CSS.match(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([^}]*)\}/)?.[1] ?? "") };

function channel(hex: string, start: number): number {
  const value = parseInt(hex.slice(start, start + 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** [text token, background token] */
const PAIRS = [
  ["--color-text", "--color-bg"],
  ["--color-text-muted", "--color-bg"],
  ["--color-text", "--color-surface"],
  ["--color-text-muted", "--color-surface"],
  ["--color-text", "--color-surface-sunken"],
  ["--color-text-muted", "--color-surface-sunken"],
  ["--color-accent-text", "--color-accent"],
  ["--color-accent-text", "--color-accent-hover"],
  ["--color-accent", "--color-bg"],
  ["--color-accent", "--color-surface"],
  ["--color-accent", "--color-accent-soft"],
  ["--color-accent", "--color-surface-sunken"],
  ["--color-accent-hover", "--color-bg"],
  ["--color-accent-hover", "--color-accent-soft"],
  ["--color-accent-hover", "--color-surface-sunken"],
  ["--color-text", "--color-accent-soft"],
  ["--color-danger-text", "--color-danger"],
  ["--color-danger", "--color-bg"],
  ["--color-danger", "--color-danger-soft"],
  ["--color-success", "--color-bg"],
  ["--color-text", "--color-success-soft"],
] as const;

const themes = { light, dark };

describe("text contrast", () => {
  it("finds both themes in globals.css", () => {
    expect(light["--color-text"]).toMatch(/^#[0-9a-f]{6}$/i);
    expect(dark["--color-text"]).toMatch(/^#[0-9a-f]{6}$/i);
    expect(dark["--color-text"]).not.toBe(light["--color-text"]);
  });

  it.each(Object.entries(themes).flatMap(([theme, tokens]) => PAIRS.map(([fg, bg]) => ({ theme, tokens, fg, bg }))))(
    "$theme: $fg on $bg is at least 4.5:1",
    ({ tokens, fg, bg }) => {
      expect(tokens[fg], fg).toMatch(/^#[0-9a-f]{6}$/i);
      expect(tokens[bg], bg).toMatch(/^#[0-9a-f]{6}$/i);
      expect(contrast(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(4.5);
    },
  );
});
