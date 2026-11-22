import { describe, expect, it } from "vitest";
import { eraOf, inScope, parseScope, scopeLabel, scopeValue } from "./scopes";

describe("parseScope", () => {
  it.each([
    { value: "lifetime", scope: { kind: "lifetime" } },
    { value: "era-pre-60s", scope: { kind: "era", era: "pre-60s" } },
    { value: "era-60s-70s", scope: { kind: "era", era: "60s-70s" } },
    { value: "era-80s-90s", scope: { kind: "era", era: "80s-90s" } },
    { value: "era-00s-on", scope: { kind: "era", era: "00s-on" } },
    { value: "decade-1970", scope: { kind: "decade", decade: 1970 } },
    { value: "year-1975", scope: { kind: "year", year: 1975 } },
    { value: "", scope: null },
    { value: "era-90s", scope: null },
    { value: "decade-1975", scope: null },
    { value: "decade-1800", scope: null },
    { value: "decade-70", scope: null },
    { value: "year-1899", scope: null },
    { value: "year-2101", scope: null },
    { value: "year-abc", scope: null },
    { value: "Lifetime", scope: null },
  ])("$value", ({ value, scope }) => {
    expect(parseScope(value)).toEqual(scope);
  });

  it.each(["lifetime", "era-60s-70s", "decade-1970", "year-1975"])("round trips %s", (value) => {
    expect(scopeValue(parseScope(value)!)).toBe(value);
  });
});

describe("eraOf", () => {
  it.each([
    { year: 1959, era: "pre-60s" },
    { year: 1960, era: "60s-70s" },
    { year: 1979, era: "60s-70s" },
    { year: 1980, era: "80s-90s" },
    { year: 1999, era: "80s-90s" },
    { year: 2000, era: "00s-on" },
    { year: 2025, era: "00s-on" },
    { year: 1900, era: "pre-60s" },
  ])("$year is in $era", ({ year, era }) => {
    expect(eraOf(year)).toBe(era);
  });
});

describe("inScope", () => {
  it.each([
    { scope: "lifetime", year: 1950, expected: true },
    { scope: "era-pre-60s", year: 1959, expected: true },
    { scope: "era-pre-60s", year: 1960, expected: false },
    { scope: "era-60s-70s", year: 1960, expected: true },
    { scope: "era-60s-70s", year: 1979, expected: true },
    { scope: "era-60s-70s", year: 1980, expected: false },
    { scope: "era-80s-90s", year: 1999, expected: true },
    { scope: "era-80s-90s", year: 2000, expected: false },
    { scope: "era-00s-on", year: 2000, expected: true },
    { scope: "era-00s-on", year: 1999, expected: false },
    { scope: "decade-1970", year: 1970, expected: true },
    { scope: "decade-1970", year: 1979, expected: true },
    { scope: "decade-1970", year: 1980, expected: false },
    { scope: "decade-1970", year: 1969, expected: false },
    { scope: "year-1975", year: 1975, expected: true },
    { scope: "year-1975", year: 1976, expected: false },
  ])("$scope holds $year: $expected", ({ scope, year, expected }) => {
    expect(inScope(parseScope(scope)!, year)).toBe(expected);
  });
});

describe("scopeLabel", () => {
  it.each([
    { scope: "lifetime", label: "Lifetime" },
    { scope: "era-60s-70s", label: "60s and 70s" },
    { scope: "decade-1970", label: "1970s" },
    { scope: "year-1975", label: "1975" },
  ])("$scope reads $label", ({ scope, label }) => {
    expect(scopeLabel(parseScope(scope)!)).toBe(label);
  });
});
