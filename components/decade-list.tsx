"use client";

import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRef, useState } from "react";
import { Cover } from "@/components/cover";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListRow } from "@/components/ui/list-row";
import { Message } from "@/components/ui/message";
import { Stack } from "@/components/ui/stack";
import type { DecadeActionResult, DecadeRow, DecadeView } from "@/lib/decade-service";
import { MAX_LIST, moveInList, sortByRating, suggestDecadeList, type DecadeMove } from "@/lib/decades";
import styles from "./decade-list.module.css";

type Action = (decade: number, albumIds: number[]) => Promise<DecadeActionResult>;

type Props = {
  initial: DecadeView;
  saveAction: Action;
  acceptAction: Action;
};

const COVER = 80;

/** The view with this order on the list. Rows come from the albums the last saved view knew about. */
function withOrder(view: DecadeView, ids: number[]): DecadeView {
  const pool = [...view.list, ...view.panel];
  const byId = new Map(pool.map((row) => [row.albumId, row]));
  const listed = new Set(ids);
  const list = ids.map((id) => byId.get(id)!);
  const panel = sortByRating(pool.filter((row) => !listed.has(row.albumId)));
  const suggestion = list.length === 0 ? suggestDecadeList(pool).map((id) => byId.get(id)!) : null;
  return { ...view, list, panel, suggestion };
}

/** The cover and text of an album row, for `ListRow`. */
function rowContent(row: DecadeRow) {
  return {
    cover: <Cover src={row.coverUrl} alt={`Cover of ${row.title}`} size={COVER} />,
    title: row.title,
    subtitle: row.artist,
    meta: (
      <>
        {row.year} · Rating {row.rating}
      </>
    ),
  };
}

function SortableRow({
  row,
  position,
  count,
  onMove,
}: {
  row: DecadeRow;
  position: number;
  count: number;
  onMove: (move: DecadeMove) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.albumId });

  return (
    <li
      ref={setNodeRef}
      className={styles.item}
      data-dragging={isDragging || undefined}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 1 : undefined,
        opacity: isDragging ? 0.6 : 1,
      }}
    >
      <div className={styles.lead}>
        <span aria-hidden className={styles.position}>
          {position}.
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={styles.handle}
          aria-label={`Reorder ${row.title}`}
          {...attributes}
          {...listeners}
        >
          ⠿
        </Button>
      </div>
      <ListRow
        className={styles.row}
        {...rowContent(row)}
        actions={
          <>
            <Button
              type="button"
              aria-label={`Move up ${row.title}`}
              disabled={position === 1}
              onClick={() => onMove({ kind: "up", id: row.albumId })}
            >
              Move up
            </Button>
            <Button
              type="button"
              aria-label={`Move down ${row.title}`}
              disabled={position === count}
              onClick={() => onMove({ kind: "down", id: row.albumId })}
            >
              Move down
            </Button>
            <Button type="button" aria-label={`Remove ${row.title}`} onClick={() => onMove({ kind: "remove", id: row.albumId })}>
              Remove
            </Button>
          </>
        }
      />
    </li>
  );
}

export function DecadeList({ initial, saveAction, acceptAction }: Props) {
  const { decade } = initial;
  const [view, setView] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  // The last state the server confirmed, and the optimistic view mirrored in a ref so queued saves read the latest order.
  const savedRef = useRef(initial);
  const viewRef = useRef(initial);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingRef = useRef(0);
  const epochRef = useRef(0);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function show(next: DecadeView) {
    viewRef.current = next;
    setView(next);
  }

  /** Runs saves one at a time. A failure reverts to the last saved view and drops saves queued behind it. */
  function enqueue(call: () => Promise<DecadeActionResult>) {
    const epoch = epochRef.current;
    pendingRef.current += 1;
    queueRef.current = queueRef.current.then(async () => {
      try {
        if (epoch !== epochRef.current) return;
        let result: DecadeActionResult;
        try {
          result = await call();
        } catch {
          result = { error: "Something went wrong. Try again." };
        }
        if ("error" in result) {
          epochRef.current += 1;
          if (result.view) savedRef.current = result.view;
          show(savedRef.current);
          setError(result.error);
        } else {
          savedRef.current = result;
          setError(null);
        }
      } finally {
        pendingRef.current -= 1;
        // With nothing queued behind it, take the server's view (real order and ratings).
        if (pendingRef.current === 0) show(savedRef.current);
      }
    });
  }

  function change(move: DecadeMove) {
    const current = viewRef.current;
    const ids = current.list.map((row) => row.albumId);
    const next = moveInList(ids, move);
    if (next.length === ids.length && next.every((id, i) => id === ids[i])) return;
    show(withOrder(current, next));
    enqueue(() => saveAction(decade, next));
  }

  function accept() {
    if (pendingRef.current > 0) return; // a second click while the first accept saves
    const ids = (viewRef.current.suggestion ?? []).map((row) => row.albumId);
    enqueue(() => acceptAction(decade, ids));
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const ids = viewRef.current.list.map((row) => row.albumId);
    change({ kind: "drop", from: ids.indexOf(active.id as number), to: ids.indexOf(over.id as number) });
  }

  const { list, suggestion, panel } = view;
  const full = list.length >= MAX_LIST;

  return (
    <Stack gap={5}>
      {error && (
        <Message tone="error" role="alert">
          {error}
        </Message>
      )}

      {list.length > 0 ? (
        <Stack as="section" gap={3} aria-labelledby="decade-list-heading">
          <h2 id="decade-list-heading">Your top {MAX_LIST}</h2>
          <DndContext id={`decade-${decade}`} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={list.map((row) => row.albumId)} strategy={verticalListSortingStrategy}>
              <ol aria-label={`Top ${MAX_LIST} of the ${decade}s`} className={styles.list}>
                {list.map((row, index) => (
                  <SortableRow key={row.albumId} row={row} position={index + 1} count={list.length} onMove={change} />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
          <p className={styles.count}>
            {list.length} of {MAX_LIST}
          </p>
        </Stack>
      ) : suggestion && suggestion.length > 0 ? (
        <Stack as="section" gap={3} aria-labelledby="decade-suggestion-heading">
          <h2 id="decade-suggestion-heading">Suggested list</h2>
          <p>No list for the {decade}s yet. Here is a suggestion from your ratings.</p>
          <ol aria-label={`Suggested top ${MAX_LIST} of the ${decade}s`} className={styles.plain}>
            {suggestion.map((row, index) => {
              const content = rowContent(row);
              return (
                <ListRow
                  as="li"
                  key={row.albumId}
                  {...content}
                  cover={
                    <div className={styles.lead}>
                      <span aria-hidden className={styles.position}>
                        {index + 1}.
                      </span>
                      {content.cover}
                    </div>
                  }
                />
              );
            })}
          </ol>
          <div>
            <Button type="button" variant="primary" onClick={accept}>
              Accept suggestion
            </Button>
          </div>
        </Stack>
      ) : (
        <EmptyState>
          No ranked or honorable mention albums in the {decade}s yet. Place albums in a year first.
        </EmptyState>
      )}

      {list.length > 0 && (
        <Stack as="section" gap={3} aria-labelledby="decade-add-heading">
          <h2 id="decade-add-heading">Add from the {decade}s</h2>
          {panel.length === 0 ? (
            <EmptyState>Every eligible album is on the list.</EmptyState>
          ) : (
            <>
              {full && <Message tone="info">The list is full. Remove one to add another.</Message>}
              <ul className={styles.plain}>
                {panel.map((row) => (
                  <ListRow
                    as="li"
                    key={row.albumId}
                    {...rowContent(row)}
                    actions={
                      <Button
                        type="button"
                        aria-label={`Add ${row.title}`}
                        disabled={full}
                        onClick={() => change({ kind: "add", id: row.albumId })}
                      >
                        Add
                      </Button>
                    }
                  />
                ))}
              </ul>
            </>
          )}
        </Stack>
      )}
    </Stack>
  );
}
