"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Cover } from "@/components/cover";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Cluster } from "@/components/ui/cluster";
import { InlineForm } from "@/components/ui/inline-form";
import { ListRow } from "@/components/ui/list-row";
import { Message } from "@/components/ui/message";
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

/** A catalog album the user can pick; `inLibraryYear` is the library year it already has, if any. */
export type CandidateView = CatalogCandidate & { inLibraryYear: number | null };

export type ReviewItemView = {
  item: ImportReviewItem;
  candidates: CandidateView[];
  /** The search box of this item: its text, and the results when the user searched. */
  search: { query: string; results: CandidateView[] | null; error: string | null };
  /** Why the last action on this item failed. */
  error: string | null;
};

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
      return `The matched album is already in your library (${item.reasonDetail}).`;
    case "rank_taken":
      return "Sent to review for a rank clash. Ranks are no longer used, so any choice adds the album to your library.";
  }
}

/** How a catalog year compares with the sheet's: nothing when within a year, a note when further off. */
export function describeYearGap(sheetYear: number, catalogYear: number | null): string | null {
  if (catalogYear === null) return null;
  const gap = Math.abs(catalogYear - sheetYear);
  return gap > 1 ? `Sheet says ${sheetYear}, ${gap} years off` : null;
}

/** Whether any form in the card is submitting. While one is, every button in the card is disabled. */
const BusyContext = createContext<{ busy: boolean; setFormPending: (pending: boolean) => void }>({
  busy: false,
  setFormPending: () => {},
});

/** Sits inside a form and tells the card when that form starts and stops submitting. */
function ReportPending() {
  const { pending } = useFormStatus();
  const { setFormPending } = useContext(BusyContext);
  useEffect(() => {
    setFormPending(pending);
    return () => setFormPending(false);
  }, [pending, setFormPending]);
  return null;
}

function SubmitButton({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  const { busy } = useContext(BusyContext);
  return (
    <Button type="submit" disabled={busy || pending}>
      {pending ? "Working..." : children}
    </Button>
  );
}

function ActionForm({ action, children }: { action: FormAction; children: ReactNode }) {
  return (
    <form action={action}>
      <ReportPending />
      {children}
    </form>
  );
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
  const yearNote = describeYearGap(item.source.year, candidate.releaseYear);
  return (
    <ListRow
      as="li"
      cover={<Cover src={candidate.coverUrl} alt={`Cover of ${candidate.title}`} size={COVER} />}
      title={candidate.title}
      subtitle={candidate.artist}
      meta={candidate.releaseYear ?? "Unknown year"}
      actions={
        <ActionForm action={actions.chooseAlbum}>
          <HiddenFields item={item} candidate={candidate} />
          {candidate.inLibraryYear !== null && <input type="hidden" name="moveHere" value="1" />}
          <SubmitButton>{candidate.inLibraryYear !== null ? "Move it here" : "Use this album"}</SubmitButton>
        </ActionForm>
      }
    >
      {yearNote && <span className={styles.note}>{yearNote}</span>}
      {candidate.inLibraryYear !== null && <span className={styles.note}>In your library ({candidate.inLibraryYear}).</span>}
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

/**
 * One review item. While any of its forms is submitting, every button in the card is disabled, so a second click
 * can't run before the first one has finished.
 */
export function ReviewCard({ view, actions }: { view: ReviewItemView; actions: ReviewActions }) {
  const { item, search } = view;
  const [busy, setBusy] = useState(false);
  return (
    <BusyContext.Provider value={{ busy, setFormPending: setBusy }}>
      <Card as="li" id={`item-${item.id}`}>
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

          <InlineForm method="get" action={`/import#item-${item.id}`}>
            <TextField
              type="search"
              name="q"
              defaultValue={search.query}
              aria-label={`Search the catalog for ${item.source.title}`}
            />
            <Button type="submit" disabled={busy}>
              Search
            </Button>
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
            <ActionForm action={actions.keepManual}>
              <input type="hidden" name="itemId" value={item.id} />
              <SubmitButton>Keep as manual album</SubmitButton>
            </ActionForm>
            <ActionForm action={actions.skip}>
              <input type="hidden" name="itemId" value={item.id} />
              <SubmitButton>Skip</SubmitButton>
            </ActionForm>
          </Cluster>
        </Stack>
      </Card>
    </BusyContext.Provider>
  );
}
