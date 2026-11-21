"use client";

import Link from "next/link";
import { useState } from "react";
import { Cover } from "@/components/cover";
import { pairKey } from "@/lib/elo/pick";
import type { MatchupActionResult, MatchupView } from "@/lib/matchups-service";
import type { AlbumCard } from "@/lib/ratings";

type Answer = "a" | "b" | "tie";

type Props = {
  initial: MatchupView;
  answerAction: (albumAId: number, albumBId: number, result: Answer, avoid: string[]) => Promise<MatchupActionResult>;
  skipAction: (albumAId: number, albumBId: number, avoid: string[]) => Promise<MatchupActionResult>;
  undoAction: (avoid: string[]) => Promise<MatchupActionResult>;
};

function Card({ album, onPick, disabled }: { album: AlbumCard; onPick: () => void; disabled: boolean }) {
  return (
    <div style={{ flex: 1, minWidth: 0, textAlign: "center" }}>
      <Cover src={album.coverUrl} alt={`Cover of ${album.title}`} />
      <div>
        <strong>{album.title}</strong>
      </div>
      <div>{album.artist}</div>
      <div>{album.year}</div>
      <button type="button" onClick={onPick} disabled={disabled}>
        I like this more
      </button>
    </div>
  );
}

export function MatchupScreen({ initial, answerAction, skipAction, undoAction }: Props) {
  const [view, setView] = useState(initial);
  const [avoid, setAvoid] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(call: () => Promise<MatchupActionResult>, onDone?: () => void) {
    setBusy(true);
    try {
      const result = await call();
      if ("error" in result) {
        setError(result.error);
      } else {
        setError(null);
        onDone?.();
        // A skip returns no line of its own, so the previous answer's line stays.
        setView((current) => ({ ...result, lastAnswer: result.lastAnswer ?? current.lastAnswer }));
      }
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const { pair } = view;

  return (
    <div>
      {error && <p role="alert">{error}</p>}
      {view.lastAnswer && <p>{view.lastAnswer.text}</p>}

      {pair ? (
        <div>
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
            <Card
              key={pair.a.id}
              album={pair.a}
              disabled={busy}
              onPick={() => run(() => answerAction(pair.a.id, pair.b.id, "a", avoid))}
            />
            <Card
              key={pair.b.id}
              album={pair.b}
              disabled={busy}
              onPick={() => run(() => answerAction(pair.a.id, pair.b.id, "b", avoid))}
            />
          </div>
          <p style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button type="button" disabled={busy} onClick={() => run(() => answerAction(pair.a.id, pair.b.id, "tie", avoid))}>
              Tie
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run(
                  () => skipAction(pair.a.id, pair.b.id, avoid),
                  () => setAvoid((current) => [...current, pairKey(pair.a.id, pair.b.id)]),
                )
              }
            >
              Skip
            </button>
          </p>
        </div>
      ) : (
        <p>
          There are no two albums from different years to compare yet. <Link href="/">Back to home</Link>
        </p>
      )}

      <p>
        <button type="button" disabled={busy || !view.canUndo} onClick={() => run(() => undoAction(avoid))}>
          Undo
        </button>
      </p>
      <p>{view.count} matchups played</p>
    </div>
  );
}
