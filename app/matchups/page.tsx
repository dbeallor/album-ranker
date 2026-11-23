import { connection } from "next/server";
import { MatchupScreen } from "@/components/matchup-screen";
import { PageHeader } from "@/components/ui/page-header";
import { getDb } from "@/lib/db/server";
import { initialMatchupView } from "@/lib/matchups-service";
import { answerMatchup, skipMatchup, undoMatchup } from "./actions";

export default async function MatchupsPage() {
  await connection(); // read the database per request, not at build time

  return (
    <>
      <PageHeader label="03 / Play" title="Play" />
      <MatchupScreen
        initial={initialMatchupView(getDb())}
        answerAction={answerMatchup}
        skipAction={skipMatchup}
        undoAction={undoMatchup}
      />
    </>
  );
}
