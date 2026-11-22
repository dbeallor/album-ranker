import type { SourceRowKey } from "../db/types.ts";
import { normalizeText } from "./normalize.ts";

/** How well a catalog title or artist agrees with the sheet's: `exact`, `close` (see `gradeTitle`, `gradeArtist`) or `none`. */
export type Grade = "exact" | "close" | "none";

const GRADE_POINTS: Record<Grade, number> = { exact: 2, close: 1, none: 0 };
/** Names shorter than this (in letters) never count as a one-typo match, so short names can't match by luck. */
const MIN_TYPO_LETTERS = 5;

function letterCount(text: string): number {
  return (text.match(/\p{L}/gu) ?? []).length;
}

/** Levenshtein distance: insertions, deletions and substitutions each cost 1. */
export function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
}

function oneTypoApart(a: string, b: string): boolean {
  return letterCount(a) >= MIN_TYPO_LETTERS && letterCount(b) >= MIN_TYPO_LETTERS && editDistance(a, b) === 1;
}

/** `normalizeText` after reading a dash, colon or slash as a space, so "Getz/Gilberto" and "Getz / Gilberto" agree. */
function loose(text: string): string {
  return normalizeText(text.replace(/[:/–—-]/g, " "));
}

/** Whether `long` is `short` followed by more words after a dash, colon or slash ("Getz/Gilberto: Deluxe Edition"). */
function extendsAfterSeparator(long: string, short: string): boolean {
  const wanted = loose(short);
  if (wanted === "") return false;
  for (const cut of long.matchAll(/[:/–—]|\s-\s/g)) {
    if (loose(long.slice(0, cut.index)) === wanted) return true;
  }
  return false;
}

/**
 * `exact` when the normalized texts are equal. `close` when the texts differ only by separators, one is the other
 * plus trailing words after a dash, colon or slash, or they are one edit apart and both have at least 5 letters.
 */
export function gradeTitle(sheet: string, catalog: string): Grade {
  const a = normalizeText(sheet);
  const b = normalizeText(catalog);
  if (a === b) return "exact";
  if (a === "" || b === "") return "none";
  if (oneTypoApart(a, b) || loose(sheet) === loose(catalog)) return "close";
  return extendsAfterSeparator(sheet, catalog) || extendsAfterSeparator(catalog, sheet) ? "close" : "none";
}

function artistWords(text: string): string[] {
  // "and" is what "&", "+" and "/" between two names read as, so it says nothing about who the artists are.
  return loose(text).split(" ").filter((word) => word !== "" && word !== "and");
}

/**
 * `exact` when the normalized texts are equal. `close` when the shorter name's words are all in the longer one
 * ("Bill Evans" in "Bill Evans Trio"), or they are one edit apart and both have at least 5 letters.
 */
export function gradeArtist(sheet: string, catalog: string): Grade {
  const a = normalizeText(sheet);
  const b = normalizeText(catalog);
  if (a === b) return "exact";
  if (a === "" || b === "") return "none";
  if (oneTypoApart(a, b)) return "close";
  const [wa, wb] = [artistWords(sheet), artistWords(catalog)];
  const [short, long] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
  // Strictly fewer words: the same words in another order is not close.
  return short.length > 0 && short.length < long.length && short.every((word) => long.includes(word)) ? "close" : "none";
}

/** How many years `year` is from the sheet's; an unknown year is farther than any known one. */
export function yearFit(year: number | null, sheetYear: number): number {
  return year === null ? Number.POSITIVE_INFINITY : Math.abs(year - sheetYear);
}

export type Graded<T> = { item: T; title: Grade; artist: Grade; yearFit: number };

type Fields = { title: string; artist: string; year: number | null };

/**
 * Grades each item against the sheet row and orders them best first: grade points (exact 2, close 1, none 0,
 * summed over title and artist), then year fit, then the order they came in.
 */
export function gradeAndRank<T>(key: SourceRowKey, items: T[], read: (item: T) => Fields): Graded<T>[] {
  return items
    .map((item, index) => {
      const { title, artist, year } = read(item);
      const graded: Graded<T> = {
        item,
        title: gradeTitle(key.title, title),
        artist: gradeArtist(key.artist, artist),
        yearFit: yearFit(year, key.year),
      };
      return { graded, index, points: GRADE_POINTS[graded.title] + GRADE_POINTS[graded.artist] };
    })
    .sort((x, y) => y.points - x.points || x.graded.yearFit - y.graded.yearFit || x.index - y.index)
    .map(({ graded }) => graded);
}
