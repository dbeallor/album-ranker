import { describe, expect, it } from "vitest";
import { safeNext } from "./redirect-target";

const cases: { name: string; next: unknown; expected: string }[] = [
  { name: "the home page passes", next: "/", expected: "/" },
  { name: "a path with a query passes", next: "/search?q=x", expected: "/search?q=x" },
  { name: "a nested path passes", next: "/library/remove/3", expected: "/library/remove/3" },
  { name: "a protocol-relative URL falls back", next: "//evil.example", expected: "/" },
  { name: "a backslash host falls back", next: "/\\evil.example", expected: "/" },
  { name: "an absolute URL falls back", next: "https://evil.example", expected: "/" },
  { name: "a javascript URL falls back", next: "javascript:alert(1)", expected: "/" },
  { name: "a path with a line break falls back", next: "/a\r\nSet-Cookie: x=1", expected: "/" },
  { name: "the login page itself falls back", next: "/login?next=/", expected: "/" },
  { name: "an empty string falls back", next: "", expected: "/" },
  { name: "a missing value falls back", next: undefined, expected: "/" },
  { name: "a non-string falls back", next: ["/"], expected: "/" },
];

describe("safeNext", () => {
  it.each(cases)("$name", ({ next, expected }) => {
    expect(safeNext(next)).toBe(expected);
  });
});
