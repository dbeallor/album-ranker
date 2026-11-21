"use client";

import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useCallback, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Cover } from "@/components/cover";
import { YearAddPanel, type ManualInput } from "@/components/year-add-panel";
import type { CatalogAlbum, SearchResult } from "@/lib/catalog/types";
import type { AddResult, Conflict, RemovedDecadeEntry, YearActionResult, YearAlbum, YearView } from "@/lib/year-service";
import {
  MAX_RANKED,
  applyMove,
  dropTarget,
  moveDown,
  moveUp,
  removeAlbum,
  type Area,
  type Placements,
} from "@/lib/year-placements";

type Props = {
  initial: YearView;
  saveAction: (year: number, placements: Placements) => Promise<YearActionResult>;
  searchAction: (query: string) => Promise<SearchResult>;
  addCatalogAction: (year: number, album: CatalogAlbum, area: Area, move: boolean) => Promise<AddResult>;
  addManualAction: (year: number, input: ManualInput) => Promise<AddResult>;
};

const AREA_NAMES: Record<Area, string> = {
  ranked: "Ranked",
  honorable_mention: "Honorable mentions",
  listed: "Listed",
};
const AREAS: Area[] = ["ranked", "honorable_mention", "listed"];
const SLOTS = Array.from({ length: MAX_RANKED }, (_, i) => i + 1);

function placementsOf(view: YearView): Placements {
  return {
    ranked: view.ranked.map((album) => album.id),
    honorableMentions: view.honorableMentions.map((album) => album.id),
    listed: view.listed.map((album) => album.id),
  };
}

/** The stored ranks when they have a gap, so the page can show the gap until the first change. Otherwise null. */
function gapLayout(view: YearView): number[] | null {
  const ranks = view.ranked.map((album) => album.rank);
  return ranks.every((rank, i) => rank === i + 1) ? null : ranks;
}

const byArtistThenTitle = (a: YearAlbum, b: YearAlbum) =>
  a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title);

function albumIndex(view: YearView): Map<number, YearAlbum> {
  return new Map([...view.ranked, ...view.honorableMentions, ...view.listed].map((album) => [album.id, album]));
}

function decadeNotices(removed: RemovedDecadeEntry[]): string[] {
  const decades = [...new Set(removed.map((entry) => entry.decade))];
  return decades.map(
    (decade) =>
      `Removed from the ${decade}s list: ${removed
        .filter((entry) => entry.decade === decade)
        .map((entry) => entry.title)
        .join(", ")}`,
  );
}

function describeConflict(conflict: Conflict, year: number): string {
  const where =
    conflict.placement === "ranked"
      ? `rank ${conflict.rank}`
      : conflict.placement === "honorable_mention"
        ? "honorable mention"
        : "listed";
  return `${conflict.title} is on ${conflict.year} (${where}). Move it to ${year}?`;
}

// Pointer position decides where a mouse or touch drop lands; the keyboard has no pointer, so it falls back to overlap.
const collisionDetection: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length > 0 ? hits : rectIntersection(args);
};

type CardProps = {
  album: YearAlbum;
  area: Area;
  position?: { index: number; count: number };
  disabled: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onMoveTo: (area: Area) => void;
  onRemove: () => void;
};

function AlbumCard({ album, area, position, disabled, onMoveUp, onMoveDown, onMoveTo, onRemove }: CardProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } = useDraggable({
    id: `album-${album.id}`,
    disabled,
    // The card holds buttons of its own, so it is a group rather than the "button" dnd-kit would default to.
    attributes: { role: "group" },
  });
  // One stable callback, so React doesn't detach and re-attach the node on every render.
  // Each card is also a drop target under the same id, which dnd-kit's keyboard movement needs to find its way around.
  const { setNodeRef: setDropRef } = useDroppable({ id: `album-${album.id}` });
  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      setNodeRef(node);
      setDropRef(node);
      setActivatorNodeRef(node);
    },
    [setNodeRef, setDropRef, setActivatorNodeRef],
  );
  const style: CSSProperties = {
    display: "flex",
    gap: 12,
    padding: 8,
    border: "1px solid #a3a3a3",
    background: "#fff",
    touchAction: "manipulation",
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    position: "relative",
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.85 : undefined,
  };
  const others = AREAS.filter((target) => target !== area);

  return (
    <div
      ref={ref}
      aria-label={album.title}
      style={style}
      {...attributes}
      {...listeners}
    >
      <div style={{ flexShrink: 0 }}>
        <Cover src={album.coverUrl} alt={`Cover of ${album.title}`} size={80} />
      </div>
      <div style={{ minWidth: 0 }}>
        <strong>{album.title}</strong>
        <div>{album.artist}</div>
        {album.rating !== null && <div>Rating {album.rating}</div>}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
          {position && (
            <>
              <button type="button" disabled={disabled || position.index === 0} onClick={onMoveUp}>
                Move up
              </button>
              <button type="button" disabled={disabled || position.index === position.count - 1} onClick={onMoveDown}>
                Move down
              </button>
            </>
          )}
          <select
            aria-label="Move to"
            value=""
            disabled={disabled}
            onChange={(event) => {
              if (event.target.value) onMoveTo(event.target.value as Area);
            }}
          >
            <option value="">Move to…</option>
            {others.map((target) => (
              <option key={target} value={target}>
                {AREA_NAMES[target]}
              </option>
            ))}
          </select>
          <button type="button" disabled={disabled} onClick={onRemove}>
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}

function DropZone({ id, children, style }: { id: string; children: ReactNode; style?: CSSProperties }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} style={{ ...style, outline: isOver ? "2px dashed #2563eb" : undefined }}>
      {children}
    </div>
  );
}

/** A filled slot is not a drop target of its own: the card in it is, so keyboard moves don't stop twice. */
function Slot({ id, filled, children }: { id: string; filled: boolean; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: filled });
  return (
    <li
      ref={setNodeRef}
      style={{ display: "flex", gap: 8, alignItems: "center", outline: isOver ? "2px dashed #2563eb" : undefined }}
    >
      {children}
    </li>
  );
}

export function YearScreen({ initial, saveAction, searchAction, addCatalogAction, addManualAction }: Props) {
  const year = initial.year;
  const [albums, setAlbums] = useState(() => albumIndex(initial));
  const [placements, setPlacements] = useState(() => placementsOf(initial));
  const [layout, setLayout] = useState(() => gapLayout(initial));
  const [error, setError] = useState<string | null>(null);
  const [notices, setNotices] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [conflict, setConflict] = useState<{ text: string; move: () => void } | null>(null);

  // The newest placements, including changes still waiting to be saved. Handlers read these, not the state.
  const latest = useRef(placements);
  const version = useRef(0);
  const savedVersion = useRef(0);
  const saved = useRef({ placements, layout });
  const queue = useRef<Promise<void>>(Promise.resolve());

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const titleOf = (id: number) => albums.get(id)?.title ?? "Album";
  const blocked = adding;

  function showView(view: YearView) {
    const next = placementsOf(view);
    const nextLayout = gapLayout(view);
    setAlbums(albumIndex(view));
    setPlacements(next);
    setLayout(nextLayout);
    latest.current = next;
    saved.current = { placements: next, layout: nextLayout };
    version.current = 0;
    savedVersion.current = 0;
  }

  /** Saves the newest placements, one request at a time. A change made meanwhile is sent in the next request. */
  function enqueueSave() {
    queue.current = queue.current.then(async () => {
      if (savedVersion.current === version.current) return;
      const sending = version.current;
      const sent = latest.current;
      try {
        const result = await saveAction(year, sent);
        if ("error" in result) throw new Error(result.error);
        savedVersion.current = sending;
        saved.current = { placements: sent, layout: null };
        setAlbums(albumIndex(result.view));
        setNotices((current) => [...current, ...decadeNotices(result.removedDecadeEntries)]);
        if (version.current === sending) setSaving(false);
      } catch (caught) {
        // Back to the last saved state; changes made since were built on the one that failed.
        latest.current = saved.current.placements;
        version.current = savedVersion.current;
        setPlacements(saved.current.placements);
        setLayout(saved.current.layout);
        setError(caught instanceof Error ? caught.message : "Something went wrong. Your change was not saved.");
        setSaving(false);
      }
    });
  }

  function change(next: { placements: Placements; pushedOut?: number | null }) {
    if (blocked) return;
    latest.current = next.placements;
    version.current += 1;
    setPlacements(next.placements);
    setLayout(null);
    setError(null);
    setConflict(null);
    setNotices(next.pushedOut ? [`${titleOf(next.pushedOut)} moved to honorable mentions`] : []);
    setSaving(true);
    enqueueSave();
  }

  /** The one function behind drops and the card buttons. */
  function move(albumId: number, target: { area: Area; index?: number }) {
    const result = applyMove(latest.current, albumId, target);
    if (JSON.stringify(result.placements) === JSON.stringify(latest.current)) return; // dropped where it was
    change(result);
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over) return;
    const albumId = Number(String(active.id).slice(6));
    const target = dropTarget(latest.current, layout, albumId, String(over.id));
    if (target) move(albumId, target);
  }

  /** Runs an add and shows what came back. Resolves true when the album was added. */
  async function runAdd(call: () => Promise<AddResult>, onConflict?: (conflict: Conflict) => void): Promise<boolean> {
    setAdding(true);
    setError(null);
    setNotices([]);
    setConflict(null);
    try {
      const result = await call();
      if ("error" in result) {
        setError(result.error);
        return false;
      }
      if ("conflict" in result) {
        onConflict?.(result.conflict);
        return false;
      }
      showView(result.view);
      setNotices(decadeNotices(result.removedDecadeEntries));
      return true;
    } catch {
      setError("Something went wrong. Try again.");
      return false;
    } finally {
      setAdding(false);
    }
  }

  function addCatalog(album: CatalogAlbum, area: Area, moveFromOtherYear = false) {
    void runAdd(
      () => addCatalogAction(year, album, area, moveFromOtherYear),
      (found) => setConflict({ text: describeConflict(found, year), move: () => addCatalog(album, area, true) }),
    );
  }

  const albumIdOf = (id: UniqueIdentifier) => Number(String(id).replace("album-", ""));
  const overLabel = (id: UniqueIdentifier): string => {
    const value = String(id);
    if (value.startsWith("slot-")) return `rank ${value.slice(5)}`;
    if (value.startsWith("album-")) return titleOf(albumIdOf(value));
    return value === "area-honorable_mention" ? "honorable mentions" : "listed";
  };
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${titleOf(albumIdOf(active.id))}.`,
    onDragOver: ({ active, over }) =>
      `${titleOf(albumIdOf(active.id))} is ${over ? `over ${overLabel(over.id)}` : "not over a drop area"}.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `Dropped ${titleOf(albumIdOf(active.id))} on ${overLabel(over.id)}.`
        : `${titleOf(albumIdOf(active.id))} was dropped outside a drop area.`,
    onDragCancel: ({ active }) => `Moving ${titleOf(albumIdOf(active.id))} was cancelled.`,
  };

  const cardProps = (id: number) => ({
    disabled: blocked,
    onMoveUp: () => change({ placements: moveUp(latest.current, id) }),
    onMoveDown: () => change({ placements: moveDown(latest.current, id) }),
    onMoveTo: (area: Area) => move(id, { area }),
    onRemove: () => change({ placements: removeAlbum(latest.current, id) }),
  });

  const { ranked, honorableMentions, listed } = placements;
  const rankedFull = ranked.length >= MAX_RANKED;
  const isEmpty = ranked.length + honorableMentions.length + listed.length === 0;
  const grid: CSSProperties = { display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" };

  function unranked(area: Area, unsorted: number[], emptyText: string) {
    // Always by artist, then title, as the server loads them, so a card lands in the same place before and after a reload.
    const ids = [...unsorted].sort((a, b) => byArtistThenTitle(albums.get(a)!, albums.get(b)!));
    return (
      <section aria-labelledby={`${area}-heading`}>
        <h2 id={`${area}-heading`}>{AREA_NAMES[area]}</h2>
        <DropZone id={`area-${area}`} style={{ ...grid, minHeight: 40, padding: 4 }}>
          {ids.length === 0 ? (
            <p>{emptyText}</p>
          ) : (
            ids.map((id) => {
              const album = albums.get(id)!;
              return <AlbumCard key={id} album={album} area={area} {...cardProps(id)} />;
            })
          )}
        </DropZone>
      </section>
    );
  }

  return (
    <div>
      {error && <p role="alert">{error}</p>}
      {notices.length > 0 && (
        <div role="status">
          {notices.map((notice) => (
            <p key={notice}>{notice}</p>
          ))}
        </div>
      )}
      {saving && <p aria-live="polite">Saving…</p>}
      {conflict && (
        <p role="alertdialog" aria-label="Move album">
          {conflict.text}{" "}
          <button type="button" disabled={blocked} onClick={conflict.move}>
            Move
          </button>{" "}
          <button type="button" onClick={() => setConflict(null)}>
            Cancel
          </button>
        </p>
      )}

      <DndContext
        id="year-screen"
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragEnd={onDragEnd}
        accessibility={{ announcements }}
      >
        {isEmpty && <p>No albums for {year} yet. Search below to add one.</p>}

        <section aria-labelledby="ranked-heading">
          <h2 id="ranked-heading">Ranked</h2>
          <ol style={{ listStyle: "none", padding: 0, display: "grid", gap: 8, maxWidth: 420 }}>
            {SLOTS.map((slot) => {
              const index = layout ? layout.indexOf(slot) : slot - 1 < ranked.length ? slot - 1 : -1;
              const id = index === -1 ? undefined : ranked[index];
              return (
                <Slot key={slot} id={`slot-${slot}`} filled={id !== undefined}>
                  <span style={{ minWidth: 24, textAlign: "right" }}>{slot}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {id === undefined ? (
                      <div style={{ padding: 8, border: "1px dashed #a3a3a3", color: "#525252" }}>
                        Empty
                      </div>
                    ) : (
                      <AlbumCard
                        album={albums.get(id)!}
                        area="ranked"
                        position={{ index, count: ranked.length }}
                        {...cardProps(id)}
                      />
                    )}
                  </div>
                </Slot>
              );
            })}
          </ol>
        </section>

        {unranked("honorable_mention", honorableMentions, "No honorable mentions yet")}
        {unranked("listed", listed, "No listed albums yet")}
      </DndContext>

      <YearAddPanel
        disabled={saving || adding}
        rankedFull={rankedFull}
        searchAction={searchAction}
        onAddCatalog={(album, area) => addCatalog(album, area)}
        onAddManual={(input) => runAdd(() => addManualAction(year, input))}
      />
    </div>
  );
}
