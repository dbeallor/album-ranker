import { connection } from "next/server";
import { MatchupScreen } from "@/components/matchup-screen";
import { PageHeader } from "@/components/ui/page-header";
import { getDb } from "@/lib/db/server";
import { loadMatchupState } from "@/lib/ratings";
import { answerMatchup, skipMatchup, undoMatchup } from "./actions";

export default async function MatchupsPage() {
  await connection(); // read the database per request, not at build time
  const { pair, count, progress } = loadMatchupState(getDb(), new Set(), Math.random);

  return (
    <>
      <PageHeader label="03 / Play" title="Play" />
      <MatchupScreen
        initial={{ pair, count, lastAnswer: null, canUndo: count > 0, progress }}
        answerAction={answerMatchup}
        skipAction={skipMatchup}
        undoAction={undoMatchup}
      />
    </>
  );
}
