import { Cover } from "@/components/cover";
import type { CatalogCandidate, ImportReviewItem } from "@/lib/db/types";

type FormAction = (formData: FormData) => void | Promise<void>;

export type ReviewActions = {
  chooseAlbum: FormAction;
  keepManual: FormAction;
  skip: FormAction;
};

/** A catalog album the user can pick; `onYearPage` is the year it already sits on, if any. */
export type CandidateView = CatalogCandidate & { onYearPage: number | null };

export type ReviewItemView = {
  item: ImportReviewItem;
  candidates: CandidateView[];
  /** The search box of this item: its text, and the results when the user searched. */
  search: { query: string; results: CandidateView[] | null; error: string | null };
  /** Why the last action on this item failed. */
  error: string | null;
};

export type ReviewCounts = { open: number; resolved: number; skipped: number };

function describeRow(item: ImportReviewItem): string {
  const placement =
    item.sourcePlacement === "ranked"
      ? `rank ${item.sourceRank}`
      : item.sourcePlacement === "honorable_mention"
        ? "honorable mention"
        : "listed";
  return item.sourceDecadeRank === null ? placement : `${placement}, decade rank ${item.sourceDecadeRank}`;
}

export function describeReason(item: ImportReviewItem): string {
  switch (item.reason) {
    case "no_match":
      return "No match in the catalog.";
    case "ambiguous":
      return "Several albums match. Pick the right one.";
    case "duplicate_album":
      return `The matched album is already on the ${item.reasonDetail} year page.`;
    case "rank_taken":
      return `Rank ${item.sourceRank} in ${item.source.year} is already held by ${item.reasonDetail}.`;
  }
}

function HiddenFields({ item, candidate }: { item: ImportReviewItem; candidate: CandidateView }) {
  return (
    <>
      <input type="hidden" name="itemId" value={item.id} />
      <input type="hidden" name="catalogId" value={candidate.catalogId} />
      <input type="hidden" name="title" value={candidate.title} />
      <input type="hidden" name="artist" value={candidate.artist} />
      <input type="hidden" name="artistId" value={candidate.artistId ?? ""} />
      <input type="hidden" name="releaseYear" value={candidate.releaseYear ?? ""} />
      <input type="hidden" name="coverUrl" value={candidate.coverUrl ?? ""} />
    </>
  );
}

function Candidate({ item, candidate, actions }: { item: ImportReviewItem; candidate: CandidateView; actions: ReviewActions }) {
  return (
    <li style={{ display: "flex", gap: 16, marginBottom: 16 }}>
      {candidate.coverUrl ? (
        <Cover src={candidate.coverUrl} alt={`Cover of ${candidate.title}`} />
      ) : (
        <div role="img" aria-label={`No cover for ${candidate.title}`} style={{ width: 125, height: 125, background: "#d4d4d4" }} />
      )}
      <div>
        <strong>{candidate.title}</strong>
        <div>{candidate.artist}</div>
        <div>{candidate.releaseYear ?? "Unknown year"}</div>
        {candidate.onYearPage !== null && <div>Already on the {candidate.onYearPage} year page.</div>}
        <form action={actions.chooseAlbum}>
          <HiddenFields item={item} candidate={candidate} />
          {candidate.onYearPage !== null && <input type="hidden" name="moveHere" value="1" />}
          <button type="submit">{candidate.onYearPage !== null ? "Move it here" : "Use this album"}</button>
        </form>
      </div>
    </li>
  );
}

function CandidateList({ item, candidates, actions }: { item: ImportReviewItem; candidates: CandidateView[]; actions: ReviewActions }) {
  return (
    <ul style={{ listStyle: "none", padding: 0 }}>
      {candidates.map((candidate) => (
        <Candidate key={candidate.catalogId} item={item} candidate={candidate} actions={actions} />
      ))}
    </ul>
  );
}

function ReviewItem({ view, actions }: { view: ReviewItemView; actions: ReviewActions }) {
  const { item, search } = view;
  return (
    <li style={{ marginBottom: 32 }}>
      <h3>
        {item.source.title} - {item.source.artist} ({item.source.year}), {describeRow(item)}
      </h3>
      <p>{describeReason(item)}</p>
      {view.error && <p role="alert">{view.error}</p>}

      {view.candidates.length > 0 && (
        <>
          <h4>Candidates</h4>
          <CandidateList item={item} candidates={view.candidates} actions={actions} />
        </>
      )}

      <form method="get" action="/import">
        <input type="hidden" name="search" value={item.id} />
        <input type="search" name="q" defaultValue={search.query} aria-label={`Search the catalog for ${item.source.title}`} />
        <button type="submit">Search</button>
      </form>
      {search.error && <p role="alert">{search.error}</p>}
      {search.results && search.results.length === 0 && <p>No albums found for &quot;{search.query}&quot;.</p>}
      {search.results && search.results.length > 0 && (
        <>
          <h4>Search results</h4>
          <CandidateList item={item} candidates={search.results} actions={actions} />
        </>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <form action={actions.keepManual}>
          <input type="hidden" name="itemId" value={item.id} />
          <button type="submit">Keep as manual album</button>
        </form>
        <form action={actions.skip}>
          <input type="hidden" name="itemId" value={item.id} />
          <button type="submit">Skip</button>
        </form>
      </div>
    </li>
  );
}

export function ImportReview({
  items,
  counts,
  error,
  removedNotice,
  fullNotice,
  actions,
}: {
  items: ReviewItemView[];
  counts: ReviewCounts;
  /** A failure for an item that is not on the page (already resolved, or unknown). */
  error: string | null;
  removedNotice: string | null;
  /** Set when the album went on its year page but the decade list was already full. */
  fullNotice: string | null;
  actions: ReviewActions;
}) {
  return (
    <div>
      <h1>Import review</h1>
      <p>
        {counts.open} open, {counts.resolved} resolved, {counts.skipped} skipped
      </p>
      {error && <p role="alert">{error}</p>}
      {removedNotice && <p role="status">{removedNotice}</p>}
      {fullNotice && <p role="status">{fullNotice}</p>}
      {items.length === 0 ? (
        <p>Nothing to check.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {items.map((view) => (
            <ReviewItem key={view.item.id} view={view} actions={actions} />
          ))}
        </ul>
      )}
    </div>
  );
}
