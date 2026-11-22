"use client";

import { useState } from "react";
import { Cover } from "@/components/cover";
import { Button, ButtonLink } from "@/components/ui/button";
import { Cluster } from "@/components/ui/cluster";
import { EmptyState } from "@/components/ui/empty-state";
import { Message } from "@/components/ui/message";
import { Stack } from "@/components/ui/stack";
import { pairKey } from "@/lib/elo/pick";
import { formatPercent } from "@/lib/elo/progress";
import type { MatchupActionResult, MatchupView } from "@/lib/matchups-service";
import type { AlbumCard } from "@/lib/ratings";
import styles from "./matchup-screen.module.css";

type Answer = "a" | "b" | "tie";

type Props = {
  initial: MatchupView;
  answerAction: (albumAId: number, albumBId: number, result: Answer, avoid: string[]) => Promise<MatchupActionResult>;
  skipAction: (albumAId: number, albumBId: number, avoid: string[]) => Promise<MatchupActionResult>;
  undoAction: (avoid: string[]) => Promise<MatchupActionResult>;
};

const COVER = 480;

function AlbumPick({ album, onPick, disabled }: { album: AlbumCard; onPick: () => void; disabled: boolean }) {
  return (
    <div className={styles.pick}>
      <div className={styles.cover}>
        <Cover src={album.coverUrl} alt={`Cover of ${album.title}`} size={COVER} fill />
      </div>
      <div className={styles.text}>
        <strong className={styles.title}>{album.title}</strong>
        <span>{album.artist}</span>
        <span className={styles.muted}>{album.year}</span>
      </div>
      <Button type="button" variant="primary" className={styles.choose} onClick={onPick} disabled={disabled}>
        I like this more
      </Button>
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
    <Stack gap={5}>
      {error && (
        <Message tone="error" role="alert">
          {error}
        </Message>
      )}
      {view.lastAnswer && <Message tone="info">{view.lastAnswer.text}</Message>}

      {pair ? (
        <Stack gap={4}>
          <div className={styles.pair}>
            <AlbumPick
              key={pair.a.id}
              album={pair.a}
              disabled={busy}
              onPick={() => run(() => answerAction(pair.a.id, pair.b.id, "a", avoid))}
            />
            <AlbumPick
              key={pair.b.id}
              album={pair.b}
              disabled={busy}
              onPick={() => run(() => answerAction(pair.a.id, pair.b.id, "b", avoid))}
            />
          </div>
          <Cluster justify="center">
            <Button type="button" disabled={busy} onClick={() => run(() => answerAction(pair.a.id, pair.b.id, "tie", avoid))}>
              Tie
            </Button>
            <Button
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
            </Button>
          </Cluster>
        </Stack>
      ) : (
        <EmptyState action={<ButtonLink href="/search">Search albums</ButtonLink>}>
          Add at least two albums to your library to start matchups.
        </EmptyState>
      )}

      <Cluster justify="between">
        <Button type="button" variant="secondary" disabled={busy || !view.canUndo} onClick={() => run(() => undoAction(avoid))}>
          Undo
        </Button>
        <Stack gap={1} className={styles.counts}>
          <p className={styles.muted}>{view.count} matchups played</p>
          {view.progress && (
            <p className={styles.muted}>
              {formatPercent(view.progress.percent)}% there ·{" "}
              {view.progress.remaining === 0 ? "Target reached" : `about ${view.progress.remaining.toLocaleString("en-US")} more to go`}
            </p>
          )}
        </Stack>
      </Cluster>
    </Stack>
  );
}
