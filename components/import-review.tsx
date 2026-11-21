import { Cover } from "@/components/cover";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Cluster } from "@/components/ui/cluster";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineForm } from "@/components/ui/inline-form";
import { ListRow } from "@/components/ui/list-row";
import { Message } from "@/components/ui/message";
import { PageHeader } from "@/components/ui/page-header";
import { Stack } from "@/components/ui/stack";
import { TextField } from "@/components/ui/text-field";
import type { CatalogCandidate, ImportReviewItem } from "@/lib/db/types";
import styles from "./import-review.module.css";

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

const COVER = 80;

function Candidate({ item, candidate, actions }: { item: ImportReviewItem; candidate: CandidateView; actions: ReviewActions }) {
  return (
    <ListRow
      as="li"
      cover={<Cover src={candidate.coverUrl} alt={`Cover of ${candidate.title}`} size={COVER} />}
      title={candidate.title}
      subtitle={candidate.artist}
      meta={candidate.releaseYear ?? "Unknown year"}
      actions={
        <form action={actions.chooseAlbum}>
          <HiddenFields item={item} candidate={candidate} />
          {candidate.onYearPage !== null && <input type="hidden" name="moveHere" value="1" />}
          <Button type="submit">{candidate.onYearPage !== null ? "Move it here" : "Use this album"}</Button>
        </form>
      }
    >
      {candidate.onYearPage !== null && <span className={styles.note}>Already on the {candidate.onYearPage} year page.</span>}
    </ListRow>
  );
}

function CandidateList({ item, candidates, actions }: { item: ImportReviewItem; candidates: CandidateView[]; actions: ReviewActions }) {
  return (
    <ul className={styles.candidates}>
      {candidates.map((candidate) => (
        <Candidate key={candidate.catalogId} item={item} candidate={candidate} actions={actions} />
      ))}
    </ul>
  );
}

function ReviewItem({ view, actions }: { view: ReviewItemView; actions: ReviewActions }) {
  const { item, search } = view;
  return (
    <Card as="li">
      <Stack gap={4}>
        <Stack gap={1}>
          <h3>
            {item.source.title} - {item.source.artist} ({item.source.year}), {describeRow(item)}
          </h3>
          <p className={styles.reason}>{describeReason(item)}</p>
        </Stack>
        {view.error && (
          <Message tone="error" role="alert">
            {view.error}
          </Message>
        )}

        {view.candidates.length > 0 && (
          <Stack gap={2}>
            <h4>Candidates</h4>
            <CandidateList item={item} candidates={view.candidates} actions={actions} />
          </Stack>
        )}

        <InlineForm method="get" action="/import">
          <TextField
            type="search"
            name="q"
            defaultValue={search.query}
            aria-label={`Search the catalog for ${item.source.title}`}
          />
          <Button type="submit">Search</Button>
          <input type="hidden" name="search" value={item.id} />
        </InlineForm>
        {search.error && (
          <Message tone="error" role="alert">
            {search.error}
          </Message>
        )}
        {search.results && search.results.length === 0 && <p>No albums found for &quot;{search.query}&quot;.</p>}
        {search.results && search.results.length > 0 && (
          <Stack gap={2}>
            <h4>Search results</h4>
            <CandidateList item={item} candidates={search.results} actions={actions} />
          </Stack>
        )}

        <Cluster>
          <form action={actions.keepManual}>
            <input type="hidden" name="itemId" value={item.id} />
            <Button type="submit">Keep as manual album</Button>
          </form>
          <form action={actions.skip}>
            <input type="hidden" name="itemId" value={item.id} />
            <Button type="submit">Skip</Button>
          </form>
        </Cluster>
      </Stack>
    </Card>
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
    <>
      <PageHeader title="Import review" />
      <Stack gap={4}>
        <Message tone="info">
          {counts.open} open, {counts.resolved} resolved, {counts.skipped} skipped
        </Message>
        {error && (
          <Message tone="error" role="alert">
            {error}
          </Message>
        )}
        {removedNotice && (
          <Message tone="info" role="status">
            {removedNotice}
          </Message>
        )}
        {fullNotice && (
          <Message tone="info" role="status">
            {fullNotice}
          </Message>
        )}
        {items.length === 0 ? (
          <EmptyState>Nothing to check.</EmptyState>
        ) : (
          <Stack as="ul" gap={4}>
            {items.map((view) => (
              <ReviewItem key={view.item.id} view={view} actions={actions} />
            ))}
          </Stack>
        )}
      </Stack>
    </>
  );
}
