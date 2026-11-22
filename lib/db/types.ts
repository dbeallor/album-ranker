export type Placement = "ranked" | "honorable_mention" | "listed";
export type MatchupResult = "a" | "b" | "tie";
export type ReviewStatus = "open" | "resolved" | "skipped";
export type ReviewReason = "no_match" | "ambiguous" | "duplicate_album" | "rank_taken";

export type DataErrorCode =
  | "album_in_library"
  | "catalog_id_taken"
  | "not_found"
  | "invalid_input";

export class DataError extends Error {
  readonly code: DataErrorCode;

  constructor(code: DataErrorCode, message: string) {
    super(message);
    this.name = "DataError";
    this.code = code;
  }
}

export type Artist = {
  id: number;
  name: string;
  catalogId: string | null;
};

export type Album = {
  id: number;
  title: string;
  artist: Artist;
  catalogId: string | null;
  releaseYear: number | null;
  coverUrl: string | null;
  createdAt: string;
};

export type SourceRowKey = {
  title: string;
  artist: string;
  year: number;
};

/** An album the user has listened to, with the year it is grouped, sorted and ranked under. */
export type LibraryEntry = {
  albumId: number;
  year: number;
  addedAt: string;
  /** The sheet row the import made the album from; null for an album added another way. */
  source: SourceRowKey | null;
};

export type Matchup = {
  id: number;
  albumAId: number;
  albumBId: number;
  result: MatchupResult;
  createdAt: string;
};

export type CatalogCandidate = {
  catalogId: string;
  title: string;
  artist: string;
  /** The catalog's artist id (ids joined with "+" for a collaboration), so a chosen candidate shares its artist. */
  artistId?: string | null;
  releaseYear: number | null;
  coverUrl: string | null;
};

export type ImportReviewItem = {
  id: number;
  source: SourceRowKey;
  sourcePlacement: Placement;
  sourceRank: number | null;
  sourceDecadeRank: number | null;
  reason: ReviewReason;
  /** The year or album the reason names, for the review page. */
  reasonDetail: string | null;
  candidates: CatalogCandidate[];
  status: ReviewStatus;
  resolvedAlbumId: number | null;
  createdAt: string;
  updatedAt: string;
};
