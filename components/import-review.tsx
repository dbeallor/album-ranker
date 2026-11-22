import { EmptyState } from "@/components/ui/empty-state";
import { Message } from "@/components/ui/message";
import { PageHeader } from "@/components/ui/page-header";
import { Stack } from "@/components/ui/stack";
import { ReviewCard, type ReviewActions, type ReviewItemView } from "./import-review-card";

export type { CandidateView, ReviewActions, ReviewItemView } from "./import-review-card";

export type ReviewCounts = { open: number; resolved: number; skipped: number };

/** What the last action did, shown at the top of the page. */
export type DoneMessage = { text: string; tone: "success" | "info" };

export function ImportReview({
  items,
  counts,
  done,
  error,
  actions,
}: {
  items: ReviewItemView[];
  counts: ReviewCounts;
  done: DoneMessage | null;
  /** A failure for an item that is not on the page (already resolved, or unknown). */
  error: string | null;
  actions: ReviewActions;
}) {
  return (
    <>
      <PageHeader label="Import" title="Import review" description={`${counts.open} left`} />
      <Stack gap={4}>
        {done && (
          <Message tone={done.tone} role="status">
            {done.text} {counts.open} left.
          </Message>
        )}
        <Message tone="info">
          {counts.open} open, {counts.resolved} resolved, {counts.skipped} skipped
        </Message>
        {error && (
          <Message tone="error" role="alert">
            {error}
          </Message>
        )}
        {items.length === 0 ? (
          <EmptyState>Nothing to check.</EmptyState>
        ) : (
          <Stack as="ul" gap={4}>
            {items.map((view) => (
              <ReviewCard key={view.item.id} view={view} actions={actions} />
            ))}
          </Stack>
        )}
      </Stack>
    </>
  );
}
