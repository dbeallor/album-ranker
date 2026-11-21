import type { CatalogAlbum } from "../catalog/types.ts";
import type { Placement, SourceRowKey } from "../db/types.ts";

/** One data row of the Albums sheet, cell values as read (nothing validated yet). */
export type RawRow = {
  /** The row's number in the sheet, counting the header as row 1. */
  rowNumber: number;
  album: unknown;
  artist: unknown;
  year: unknown;
  rank: unknown;
  honorableMention: unknown;
  decadeRank: unknown;
};

/** A validated row, ready to match and write. */
export type ImportRow = {
  rowNumber: number;
  key: SourceRowKey;
  placement: Placement;
  rank: number | null;
  decadeRank: number | null;
  /** The sheet gave both a rank and the honorable mention flag; the flag won and the rank was dropped. */
  conflictingPlacement: { droppedRank: number } | null;
  /** Why the row's decade rank was dropped (listed row, not a whole number, outside 1 to 25); null when it was kept or absent. */
  droppedDecadeRank: string | null;
};

/** Searches the catalog; rejects when the catalog can't answer. Tests pass a fake. */
export type CatalogSearch = (query: string) => Promise<CatalogAlbum[]>;

/** "Album - Artist (year)", how the summary names a row. */
export function describeKey(key: SourceRowKey): string {
  return `${key.title} - ${key.artist} (${key.year})`;
}
