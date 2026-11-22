/** A slice of the library by library year: everything, one era, one decade or one year. */
export type EraKey = "pre-60s" | "60s-70s" | "80s-90s" | "00s-on";

export type Scope =
  | { kind: "lifetime" }
  | { kind: "era"; era: EraKey }
  | { kind: "decade"; decade: number }
  | { kind: "year"; year: number };

export const ERAS: { key: EraKey; label: string }[] = [
  { key: "pre-60s", label: "Pre-60s" },
  { key: "60s-70s", label: "60s and 70s" },
  { key: "80s-90s", label: "80s and 90s" },
  { key: "00s-on", label: "00s and after" },
];

export const LIFETIME: Scope = { kind: "lifetime" };

const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

export function eraOf(year: number): EraKey {
  if (year < 1960) return "pre-60s";
  if (year < 1980) return "60s-70s";
  if (year < 2000) return "80s-90s";
  return "00s-on";
}

export function decadeOf(year: number): number {
  return Math.floor(year / 10) * 10;
}

export function eraLabel(era: EraKey): string {
  return ERAS.find((e) => e.key === era)!.label;
}

/** The URL value of a scope: `lifetime`, `era-60s-70s`, `decade-1970`, `year-1975`. */
export function scopeValue(scope: Scope): string {
  switch (scope.kind) {
    case "lifetime":
      return "lifetime";
    case "era":
      return `era-${scope.era}`;
    case "decade":
      return `decade-${scope.decade}`;
    case "year":
      return `year-${scope.year}`;
  }
}

/** The scope a URL value names, or null when it is not one. */
export function parseScope(value: string): Scope | null {
  if (value === "lifetime") return LIFETIME;
  const era = ERAS.find((e) => value === `era-${e.key}`);
  if (era) return { kind: "era", era: era.key };
  const decade = /^decade-(\d{4})$/.exec(value);
  if (decade) {
    const start = Number(decade[1]);
    return start >= MIN_YEAR && start <= MAX_YEAR && start % 10 === 0 ? { kind: "decade", decade: start } : null;
  }
  const year = /^year-(\d{4})$/.exec(value);
  if (year) {
    const y = Number(year[1]);
    return y >= MIN_YEAR && y <= MAX_YEAR ? { kind: "year", year: y } : null;
  }
  return null;
}

export function inScope(scope: Scope, year: number): boolean {
  switch (scope.kind) {
    case "lifetime":
      return true;
    case "era":
      return eraOf(year) === scope.era;
    case "decade":
      return decadeOf(year) === scope.decade;
    case "year":
      return year === scope.year;
  }
}

/** A name for headings and empty states: "Lifetime", "60s and 70s", "1970s", "1975". */
export function scopeLabel(scope: Scope): string {
  switch (scope.kind) {
    case "lifetime":
      return "Lifetime";
    case "era":
      return eraLabel(scope.era);
    case "decade":
      return `${scope.decade}s`;
    case "year":
      return String(scope.year);
  }
}
