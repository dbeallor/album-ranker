import type { DatabaseSync } from "node:sqlite";
import { ImportReview, type CandidateView, type ReviewItemView } from "@/components/import-review";
import { searchAlbums } from "@/lib/catalog/search";
import { findAlbumByCatalogId } from "@/lib/db/albums";
import { listImportReviewItems } from "@/lib/db/import-review";
import { getLibraryEntry } from "@/lib/db/library";
import { getDb } from "@/lib/db/server";
import type { CatalogCandidate } from "@/lib/db/types";
import { chooseAlbumAction, keepManualAction, skipAction } from "./actions";

type Param = string | string[] | undefined;
type SearchParams = Promise<{ search?: Param; q?: Param; error?: Param; item?: Param }>;

function first(param: Param): string {
  return (Array.isArray(param) ? param[0] : param) ?? "";
}

function withLibraryYear(db: DatabaseSync, candidate: CatalogCandidate): CandidateView {
  const album = findAlbumByCatalogId(db, candidate.catalogId);
  return { ...candidate, inLibraryYear: (album && getLibraryEntry(db, album.id)?.year) || null };
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
      candidates: item.candidates.map((candidate) => withLibraryYear(db, candidate)),
      search: {
        query: isSearched ? first(params.q) : `${item.source.title} ${item.source.artist}`,
        results:
          isSearched && searchResult?.ok
            ? searchResult.albums.map((album) =>
                withLibraryYear(db, {
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

  return (
    <ImportReview
      items={items}
      counts={counts}
      error={errorMessage && !open.some((item) => item.id === errorItemId) ? errorMessage : null}
      actions={{ chooseAlbum: chooseAlbumAction, keepManual: keepManualAction, skip: skipAction }}
    />
  );
}
