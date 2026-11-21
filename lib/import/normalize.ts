/**
 * Normalizes a title or artist for comparison: accents removed, lower case, "&" and "+" read as "and",
 * a leading "the " and a trailing bracketed qualifier removed, other punctuation removed, spaces collapsed.
 */
export function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[&+]/g, " and ")
    .replace(/(?<=\S)\s*(\([^()[\]]*\)|\[[^()[\]]*\])\s*$/, "")
    .replace(/^\s*the\s+/, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}
