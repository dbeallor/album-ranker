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
import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Cover } from "@/components/cover";
import type { DecadeActionResult, DecadeRow, DecadeView } from "@/lib/decade-service";
import { MAX_LIST, moveInList, sortByRating, suggestDecadeList, type DecadeMove } from "@/lib/decades";

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

const rowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 12,
  padding: "8px 0",
  borderBottom: "1px solid #e5e5e5",
};

function RowDetails({ row }: { row: DecadeRow }) {
  return (
    <>
      <Cover src={row.coverUrl} alt={`Cover of ${row.title}`} size={COVER} />
      <div style={{ flex: "1 1 200px", minWidth: 0 }}>
        <strong>{row.title}</strong>
        <div>{row.artist}</div>
        <div>
          {row.year} · Rating {row.rating}
        </div>
      </div>
    </>
  );
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
  const style: CSSProperties = {
    ...rowStyle,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    background: "Canvas",
  };

  return (
    <li ref={setNodeRef} style={style}>
      <span aria-hidden>{position}.</span>
      <button
        type="button"
        aria-label={`Reorder ${row.title}`}
        style={{ touchAction: "none", cursor: "grab" }}
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
      <RowDetails row={row} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          aria-label={`Move up ${row.title}`}
          disabled={position === 1}
          onClick={() => onMove({ kind: "up", id: row.albumId })}
        >
          Move up
        </button>
        <button
          type="button"
          aria-label={`Move down ${row.title}`}
          disabled={position === count}
          onClick={() => onMove({ kind: "down", id: row.albumId })}
        >
          Move down
        </button>
        <button type="button" aria-label={`Remove ${row.title}`} onClick={() => onMove({ kind: "remove", id: row.albumId })}>
          Remove
        </button>
      </div>
    </li>
  );
}

function Section({ children }: { children: ReactNode }) {
  return <section style={{ marginTop: 24 }}>{children}</section>;
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
    <div>
      {error && <p role="alert">{error}</p>}

      {list.length > 0 ? (
        <>
          <DndContext id={`decade-${decade}`} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={list.map((row) => row.albumId)} strategy={verticalListSortingStrategy}>
              <ol aria-label={`Top ${MAX_LIST} of the ${decade}s`} style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {list.map((row, index) => (
                  <SortableRow key={row.albumId} row={row} position={index + 1} count={list.length} onMove={change} />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
          <p>
            {list.length} of {MAX_LIST}
          </p>
        </>
      ) : suggestion && suggestion.length > 0 ? (
        <Section>
          <p>No list for the {decade}s yet. Here is a suggestion from your ratings.</p>
          <ol aria-label={`Suggested top ${MAX_LIST} of the ${decade}s`} style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {suggestion.map((row, index) => (
              <li key={row.albumId} style={rowStyle}>
                <span aria-hidden>{index + 1}.</span>
                <RowDetails row={row} />
              </li>
            ))}
          </ol>
          <p>
            <button type="button" onClick={accept}>
              Accept suggestion
            </button>
          </p>
        </Section>
      ) : (
        <p>
          No ranked or honorable mention albums in the {decade}s yet. Place albums in a year first.
        </p>
      )}

      {list.length > 0 && (
        <Section>
          <h2>Add from the {decade}s</h2>
          {panel.length === 0 ? (
            <p>Every eligible album is on the list.</p>
          ) : (
            <>
              {full && <p>The list is full. Remove one to add another.</p>}
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {panel.map((row) => (
                  <li key={row.albumId} style={rowStyle}>
                    <RowDetails row={row} />
                    <button
                      type="button"
                      aria-label={`Add ${row.title}`}
                      disabled={full}
                      onClick={() => change({ kind: "add", id: row.albumId })}
                    >
                      Add
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Section>
      )}
    </div>
  );
}
