import type { DatabaseSync } from "node:sqlite";
import { ImportReview, type CandidateView, type ReviewItemView } from "@/components/import-review";
import { searchAlbums } from "@/lib/catalog/search";
import { findAlbumByCatalogId } from "@/lib/db/albums";
import { listImportReviewItems } from "@/lib/db/import-review";
import { getDb } from "@/lib/db/server";
import type { CatalogCandidate } from "@/lib/db/types";
import { getYearEntryByAlbum } from "@/lib/db/year-entries";
import { chooseAlbumAction, keepManualAction, skipAction } from "./actions";

type Param = string | string[] | undefined;
type SearchParams = Promise<{ search?: Param; q?: Param; error?: Param; item?: Param; removed?: Param; album?: Param; full?: Param }>;

function first(param: Param): string {
  return (Array.isArray(param) ? param[0] : param) ?? "";
}

function withYearPage(db: DatabaseSync, candidate: CatalogCandidate): CandidateView {
  const album = findAlbumByCatalogId(db, candidate.catalogId);
  return { ...candidate, onYearPage: (album && getYearEntryByAlbum(db, album.id)?.year) || null };
}

export default async function ImportPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const db = getDb();
  const all = listImportReviewItems(db);
  const open = all
    .filter((item) => item.status === "open")
    .sort((a, b) => a.source.year - b.source.year || a.id - b.id);
  const counts = {
    open: open.length,
    resolved: all.filter((item) => item.status === "resolved").length,
    skipped: all.filter((item) => item.status === "skipped").length,
  };

  const searchedId = Number(first(params.search));
  const searchedQuery = first(params.q).trim();
  const searched = open.find((item) => item.id === searchedId);
  const searchResult = searched && searchedQuery !== "" ? await searchAlbums(searchedQuery) : null;

  const errorItemId = Number(first(params.item));
  const errorMessage = first(params.error) || null;

  const items: ReviewItemView[] = open.map((item) => {
    const isSearched = item === searched;
    return {
      item,
      candidates: item.candidates.map((candidate) => withYearPage(db, candidate)),
      search: {
        query: isSearched ? first(params.q) : `${item.source.title} ${item.source.artist}`,
        results:
          isSearched && searchResult?.ok
            ? searchResult.albums.map((album) =>
                withYearPage(db, {
                  catalogId: album.catalogId,
                  title: album.title,
                  artist: album.artist,
                  artistId: album.artistId,
                  releaseYear: album.year,
                  coverUrl: album.coverUrl,
                }),
              )
            : null,
        error: isSearched && searchResult && !searchResult.ok ? searchResult.message : null,
      },
      error: errorMessage && item.id === errorItemId ? errorMessage : null,
    };
  });

  const removed = Number(first(params.removed));
  const removedNotice =
    removed > 0
      ? `${first(params.album) || "The album"} no longer qualifies for a decade list, so ${removed} decade list ${removed === 1 ? "entry was" : "entries were"} removed.`
      : null;

  const fullTitle = first(params.full).trim();
  const fullNotice =
    fullTitle === ""
      ? null
      : `${fullTitle} was added to its year page but not to the decade list, because that list already has 25 albums.`;

  return (
    <ImportReview
      items={items}
      counts={counts}
      error={errorMessage && !open.some((item) => item.id === errorItemId) ? errorMessage : null}
      removedNotice={removedNotice}
      fullNotice={fullNotice}
      actions={{ chooseAlbum: chooseAlbumAction, keepManual: keepManualAction, skip: skipAction }}
    />
  );
}
