import { connection } from "next/server";
import { MatchupScreen } from "@/components/matchup-screen";
import { getDb } from "@/lib/db/server";
import { loadMatchupState } from "@/lib/ratings";
import { answerMatchup, skipMatchup, undoMatchup } from "./actions";

export default async function MatchupsPage() {
  await connection(); // read the database per request, not at build time
  const { pair, count } = loadMatchupState(getDb(), new Set(), Math.random);

  return (
    <main>
      <h1>Matchups</h1>
      <MatchupScreen
        initial={{ pair, count, lastAnswer: null, canUndo: count > 0 }}
        answerAction={answerMatchup}
        skipAction={skipMatchup}
        undoAction={undoMatchup}
      />
    </main>
  );
}
