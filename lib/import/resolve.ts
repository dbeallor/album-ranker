import type { DatabaseSync } from "node:sqlite";
import { createAlbum, findAlbumByCatalogId, getAlbum } from "../db/albums.ts";
import {
  decadeOf,
  getDecadeList,
  insertIntoDecadeBySourceRank,
  setDecadeList,
  type DecadeInsertResult,
} from "../db/decade-lists.ts";
import { getImportReviewItem, resolveImportReviewItem, skipImportReviewItem } from "../db/import-review.ts";
import { transaction } from "../db/transaction.ts";
import {
  DataError,
  type CatalogCandidate,
  type DecadeListEntry,
  type ImportReviewItem,
} from "../db/types.ts";
import {
  addYearEntry,
  findRankHolder,
  getYearEntryByAlbum,
  moveYearEntry,
  setSourceDecadeRank,
} from "../db/year-entries.ts";

/** What the user picked for a review item. */
export type ResolveChoice =
  | {
      kind: "catalog";
      album: CatalogCandidate;
      /** The album is already on another year page: move its year entry to this row's year and placement. */
      moveHere?: boolean;
    }
  | { kind: "manual" };

export type ResolveFailure =
  | { ok: false; code: "not_found" | "not_open"; message: string }
  /** The row's rank is used in its year; `holder` names the album that has it. The item stays open. */
  | { ok: false; code: "rank_taken"; message: string; holder: { albumId: number; title: string; artist: string } }
  /** The chosen album is on a year page already; offer "Move it here" (`moveHere: true`). */
  | { ok: false; code: "album_on_year_page"; message: string; albumId: number; year: number }
  | { ok: false; code: "invalid"; message: string };

export type ResolveSuccess = {
  ok: true;
  albumId: number;
  /** The year the album was on before "Move it here". */
  movedFromYear: number | null;
  /** Null when the row has no decade rank. */
  decade: DecadeInsertResult | null;
  /** Decade list entries the move removed because the album stopped being eligible. */
  removedDecadeEntries: DecadeListEntry[];
  item: ImportReviewItem;
};

export type ResolveResult = ResolveSuccess | ResolveFailure;

/** Thrown inside the transaction to roll it back and report a failure without changing anything. */
class Rollback extends Error {
  failure: ResolveFailure;

  constructor(failure: ResolveFailure) {
    super(failure.message);
    this.failure = failure;
  }
}

function openItem(db: DatabaseSync, itemId: number): ImportReviewItem {
  const item = getImportReviewItem(db, itemId);
  if (!item) throw new Rollback({ ok: false, code: "not_found", message: `Import review item ${itemId} does not exist.` });
  if (item.status !== "open") {
    throw new Rollback({ ok: false, code: "not_open", message: `This item is already ${item.status}.` });
  }
  return item;
}

function rankTaken(db: DatabaseSync, item: ImportReviewItem, albumId: number): Rollback {
  const held = getAlbum(db, albumId)!;
  return new Rollback({
    ok: false,
    code: "rank_taken",
    message: `Rank ${item.sourceRank} in ${item.source.year} is held by ${held.title} - ${held.artist.name}.`,
    holder: { albumId, title: held.title, artist: held.artist.name },
  });
}

/**
 * Applies the user's choice to an open review item in one transaction: creates or reuses the album, adds the
 * row's year entry and decade list entry, and marks the item resolved. On any failure nothing changes and
 * the item stays open.
 */
export function resolveReviewItem(db: DatabaseSync, itemId: number, choice: ResolveChoice): ResolveResult {
  try {
    return transaction(db, (): ResolveSuccess => {
      const item = openItem(db, itemId);
      const existing = choice.kind === "catalog" ? findAlbumByCatalogId(db, choice.album.catalogId) : undefined;
      const entry = existing ? getYearEntryByAlbum(db, existing.id) : undefined;
      if (existing && entry && choice.kind === "catalog" && !choice.moveHere) {
        throw new Rollback({
          ok: false,
          code: "album_on_year_page",
          message: `${existing.title} is already on the ${entry.year} year page.`,
          albumId: existing.id,
          year: entry.year,
        });
      }
      const holder = item.sourceRank === null ? undefined : findRankHolder(db, item.source.year, item.sourceRank);
      if (holder !== undefined && holder !== existing?.id) throw rankTaken(db, item, holder);

      let albumId: number;
      let movedFromYear: number | null = null;
      let removedDecadeEntries: DecadeListEntry[] = [];
      if (existing && entry) {
        albumId = existing.id;
        movedFromYear = entry.year;
        removedDecadeEntries = moveYearEntry(db, albumId, item.source.year, {
          placement: item.sourcePlacement,
          rank: item.sourceRank,
        }).removedDecadeEntries;
        // Always overwrite, including with null, so the album keeps no decade rank from its old row.
        setSourceDecadeRank(db, albumId, item.sourceDecadeRank);
      } else {
        albumId =
          existing?.id ??
          (choice.kind === "catalog"
            ? createAlbum(db, {
                title: choice.album.title,
                artist: { name: choice.album.artist, catalogId: choice.album.artistId ?? null },
                catalogId: choice.album.catalogId,
                releaseYear: choice.album.releaseYear,
                coverUrl: choice.album.coverUrl,
              })
            : createAlbum(db, {
                title: item.source.title,
                artist: { name: item.source.artist },
                releaseYear: item.source.year,
              })
          ).id;
        addYearEntry(db, {
          albumId,
          year: item.source.year,
          placement: item.sourcePlacement,
          rank: item.sourceRank,
          source: item.source,
          sourceDecadeRank: item.sourceDecadeRank,
        });
      }

      let decade: DecadeInsertResult | null = null;
      if (item.sourceDecadeRank !== null && item.sourcePlacement !== "listed") {
        const decadeStart = decadeOf(item.source.year);
        decade = insertIntoDecadeBySourceRank(db, albumId, decadeStart);
        if (decade.status === "already_listed" && movedFromYear !== null) {
          // A same-decade move can change the decade rank: take the album off the list and put it back
          // where the new rank belongs. Removing it first leaves room, so the list is never full here.
          const others = getDecadeList(db, decadeStart)
            .map((listed) => listed.albumId)
            .filter((listedId) => listedId !== albumId);
          setDecadeList(db, decadeStart, others);
          decade = insertIntoDecadeBySourceRank(db, albumId, decadeStart);
        }
      }
      return {
        ok: true,
        albumId,
        movedFromYear,
        decade,
        removedDecadeEntries,
        item: resolveImportReviewItem(db, itemId, albumId),
      };
    });
  } catch (error) {
    if (error instanceof Rollback) return error.failure;
    if (error instanceof DataError) return { ok: false, code: "invalid", message: error.message };
    throw error;
  }
}

/** Marks an open review item skipped. Nothing is added. */
export function skipReviewItem(
  db: DatabaseSync,
  itemId: number,
): { ok: true; item: ImportReviewItem } | ResolveFailure {
  try {
    return transaction(db, () => {
      openItem(db, itemId);
      return { ok: true as const, item: skipImportReviewItem(db, itemId) };
    });
  } catch (error) {
    if (error instanceof Rollback) return error.failure;
    throw error;
  }
}
