import { existsSync } from "node:fs";
import readExcelFile from "read-excel-file/node";
import type { RawRow } from "./types.ts";

/** The file can't be imported as given (missing, not an .xlsx, no Albums sheet, a header missing). The message is for the user. */
export class ImportInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportInputError";
  }
}

export const ALBUMS_SHEET = "Albums";

type Sheet = { sheet: string; data: unknown[][] };

function headerText(cell: unknown): string {
  return typeof cell === "string" ? cell.trim().toLowerCase() : "";
}

/**
 * Finds the Albums sheet and its columns by header and returns the data rows as plain values. The input
 * `Rank` is the first one to the right of `Album`; the sheet has a derived `Rank` label before it.
 */
export function extractRows(sheets: Sheet[]): RawRow[] {
  const albums = sheets.find((sheet) => sheet.sheet === ALBUMS_SHEET);
  if (!albums) {
    const found = sheets.map((sheet) => `"${sheet.sheet}"`).join(", ");
    throw new ImportInputError(`The file has no sheet named "${ALBUMS_SHEET}". Sheets found: ${found || "none"}.`);
  }

  const header = (albums.data[0] ?? []).map(headerText);
  const column = (name: string, after = -1): number => {
    const index = header.findIndex((text, i) => i > after && text === name.toLowerCase());
    if (index === -1) {
      throw new ImportInputError(
        after === -1
          ? `The "${ALBUMS_SHEET}" sheet has no "${name}" column in row 1.`
          : `The "${ALBUMS_SHEET}" sheet has no "${name}" column to the right of "Album" in row 1.`,
      );
    }
    return index;
  };

  const album = column("Album");
  const artist = column("Artist");
  const year = column("Year");
  const rank = column("Rank", album);
  const honorableMention = column("Honorable Mention");
  const decadeRank = column("Decade Top 25 Rank");

  return albums.data.slice(1).map((cells, index) => ({
    rowNumber: index + 2,
    album: cells[album],
    artist: cells[artist],
    year: cells[year],
    rank: cells[rank],
    honorableMention: cells[honorableMention],
    decadeRank: cells[decadeRank],
  }));
}

/** Reads the Albums sheet of the .xlsx file at `path`. */
export async function readAlbumsSheet(path: string): Promise<RawRow[]> {
  if (!existsSync(path)) {
    throw new ImportInputError(`File not found: ${path}`);
  }
  let sheets: Sheet[];
  try {
    sheets = (await readExcelFile(path)) as Sheet[];
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new ImportInputError(`Could not read ${path} as an .xlsx file: ${reason}`);
  }
  return extractRows(sheets);
}
