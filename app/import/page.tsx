import type { DatabaseSync } from "node:sqlite";
import { ImportReview, type CandidateView, type DoneMessage, type ReviewItemView } from "@/components/import-review";
import { searchAlbums } from "@/lib/catalog/search";
import { findAlbumByCatalogId, getAlbum } from "@/lib/db/albums";
import { getImportReviewItem, listImportReviewItems } from "@/lib/db/import-review";
import { getLibraryEntry } from "@/lib/db/library";
import { getDb } from "@/lib/db/server";
import type { CatalogCandidate } from "@/lib/db/types";
import { defaultSearchText, rankStoredCandidates, searchForReview } from "@/lib/import/match";
import { openInReviewOrder } from "@/lib/import/review-order";
import type { CatalogSearch } from "@/lib/import/types";
import { chooseAlbumAction, keepManualAction, skipAction } from "./actions";

type Param = string | string[] | undefined;
type SearchParams = Promise<{ search?: Param; q?: Param; error?: Param; item?: Param; album?: Param; done?: Param; already?: Param; moved?: Param }>;

function first(param: Param): string {
  return (Array.isArray(param) ? param[0] : param) ?? "";
}

const ERROR_MESSAGES: Record<string, string> = {
  not_found: "That review item could not be found.",
  missing_details: "That album is missing its catalog details.",
  invalid: "That album couldn't be saved. Check its details and try again.",
};

/** The message for an action's `error` code, or null for a code the app didn't send. `in_library` names the album from the database. */
function errorText(db: DatabaseSync, code: string, albumParam: string): string | null {
  if (code === "in_library") {
    const albumId = /^\d+$/.test(albumParam) ? Number(albumParam) : null;
    const album = albumId === null || !Number.isSafeInteger(albumId) ? undefined : getAlbum(db, albumId);
    const entry = album && getLibraryEntry(db, album.id);
    return album && entry ? `${album.title} is already in your library (${entry.year}).` : "That album is already in your library.";
  }
  return Object.hasOwn(ERROR_MESSAGES, code) ? ERROR_MESSAGES[code] : null;
}

function withLibraryYear(db: DatabaseSync, candidate: CatalogCandidate): CandidateView {
  const album = findAlbumByCatalogId(db, candidate.catalogId);
  return { ...candidate, inLibraryYear: (album && getLibraryEntry(db, album.id)?.year) || null };
}

/** The catalog search the import uses, as a function that throws when the catalog can't answer. */
const catalogSearch: CatalogSearch = async (query) => {
  const result = await searchAlbums(query);
  if (!result.ok) throw new Error(result.message);
  return result.albums;
};

/**
 * What the last action did. The item's stored status says whether it was skipped or resolved; the URL says whether the
 * album was moved (`moved=1`) or the click was a repeat (`already=1`), so a reload shows the same text.
 */
function describeDone(db: DatabaseSync, itemId: number, flags: { already: boolean; moved: boolean }): DoneMessage | null {
  const item = getImportReviewItem(db, itemId);
  if (!item || item.status === "open") return null;
  const title = item.source.title;
  if (flags.already) return { text: `${title} was already handled.`, tone: "info" };
  if (item.status === "skipped") return { text: `Skipped ${title}.`, tone: "success" };

  const album = item.resolvedAlbumId === null ? undefined : getAlbum(db, item.resolvedAlbumId);
  const entry = album && getLibraryEntry(db, album.id);
  if (!album || !entry) return { text: `Added ${title} to your library.`, tone: "success" };
  return flags.moved
    ? { text: `Moved ${album.title} to ${entry.year}.`, tone: "success" }
    : { text: `Added ${album.title} (${entry.year}) to your library.`, tone: "success" };
}

export default async function ImportPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const db = getDb();
  const all = listImportReviewItems(db);
  const open = openInReviewOrder(all);
  const counts = {
    open: open.length,
    resolved: all.filter((item) => item.status === "resolved").length,
    skipped: all.filter((item) => item.status === "skipped").length,
  };

  const doneId = Number(first(params.done));
  const done = first(params.done) !== "" && Number.isInteger(doneId) ? describeDone(db, doneId, { already: first(params.already) === "1", moved: first(params.moved) === "1" }) : null;

  const searchedId = Number(first(params.search));
  const searchedQuery = first(params.q).trim();
  const searched = open.find((item) => item.id === searchedId);
  let searchResults: CandidateView[] | null = null;
  let searchError: string | null = null;
  if (searched && searchedQuery !== "") {
    try {
      const albums = await searchForReview(
        searched.source,
        searchedQuery,
        searchedQuery === defaultSearchText(searched.source),
        catalogSearch,
      );
      searchResults = albums.map((album) =>
        withLibraryYear(db, {
          catalogId: album.catalogId,
          title: album.title,
          artist: album.artist,
          artistId: album.artistId,
          releaseYear: album.year,
          coverUrl: album.coverUrl,
        }),
      );
    } catch (error) {
      searchError = error instanceof Error ? error.message : "The album catalog couldn't be reached. Try again later.";
    }
  }

  const errorItemId = Number(first(params.item));
  const errorMessage = errorText(db, first(params.error), first(params.album));

  const items: ReviewItemView[] = open.map((item) => {
    const isSearched = item === searched;
    return {
      item,
      candidates: rankStoredCandidates({ key: item.source }, item.candidates).map((candidate) => withLibraryYear(db, candidate)),
      search: {
        query: isSearched ? first(params.q) : defaultSearchText(item.source),
        results: isSearched ? searchResults : null,
        error: isSearched ? searchError : null,
      },
      error: errorMessage && item.id === errorItemId ? errorMessage : null,
    };
  });

  return (
    <ImportReview
      items={items}
      counts={counts}
      done={done}
      error={errorMessage && !open.some((item) => item.id === errorItemId) ? errorMessage : null}
      actions={{ chooseAlbum: chooseAlbumAction, keepManual: keepManualAction, skip: skipAction }}
    />
  );
}
