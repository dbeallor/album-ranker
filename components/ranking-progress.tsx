import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Cluster } from "@/components/ui/cluster";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { Stack } from "@/components/ui/stack";
import { formatPercent, type RankingProgress as Measure } from "@/lib/elo/progress";
import styles from "./ranking-progress.module.css";

const count = (value: number) => value.toLocaleString("en-US");

/** The overall ranking progress: the share of the way to an approximately right order, with what is left to play. */
export function RankingProgress({ progress }: { progress: Measure | null }) {
  if (!progress) {
    return (
      <EmptyState action={<ButtonLink href="/search">Search albums</ButtonLink>}>
        Add at least two albums to your library to track ranking progress.
      </EmptyState>
    );
  }

  const { percent, played, goal, remaining, confidence, target } = progress;
  return (
    <Card as="section" aria-labelledby="ranking-progress-heading">
      <Stack gap={3}>
        <Cluster justify="between" align="end">
          <h2 id="ranking-progress-heading" className={styles.heading}>
            Ranking progress
          </h2>
          <span className={styles.percent}>{formatPercent(percent)}%</span>
        </Cluster>
        <Progress value={percent} aria-label="Ranking progress" />
        <Stack gap={1}>
          <p>
            {count(played)} of about {count(goal)} matchups
          </p>
          <p>{remaining === 0 ? "Target reached" : `About ${count(remaining)} more to go`}</p>
          <p>
            Order confidence {formatPercent(confidence * 100)}% · target {formatPercent(target * 100)}%
          </p>
        </Stack>
        <p className={styles.muted}>
          The expected share of album pairs that are in the right order. Adding albums lowers it; playing matchups raises it.
        </p>
        <div>
          <ButtonLink href="/matchups">Play matchups</ButtonLink>
        </div>
      </Stack>
    </Card>
  );
}
