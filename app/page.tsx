import { connection } from "next/server";
import { CardGrid } from "@/components/ui/card-grid";
import { LinkCard } from "@/components/ui/link-card";
import { PageHeader } from "@/components/ui/page-header";
import { getDb } from "@/lib/db/server";
import { listImportReviewItems } from "@/lib/db/import-review";
import { listLibrary } from "@/lib/db/library";
import { countMatchups } from "@/lib/db/matchups";

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export default async function Home() {
  // The count comes from the database, so this page is rendered per request, not at build time.
  await connection();
  const db = getDb();
  const openItems = listImportReviewItems(db, "open").length;
  const albums = listLibrary(db).length;
  const matchups = countMatchups(db);
  const description =
    albums === 0
      ? "Your library is empty. Search for an album to start."
      : `Build a library, play matchups, read the rankings. ${plural(albums, "album")} in your library · ${plural(matchups, "matchup")} played`;

  return (
    <>
      <PageHeader title="Album ranker" description={description} />
      <CardGrid>
        <LinkCard href="/search" title="Search albums" description="Find an album in the catalog and add it to your library." />
        <LinkCard href="/library" title="Library" description="Browse, sort and filter every album you have added." />
        <LinkCard href="/matchups" title="Matchups" description="Pick the better of two albums to refine your ratings." />
        <LinkCard href="/analytics" title="Analytics" description="See album and artist rankings by lifetime, era, decade and year." />
        {openItems > 0 && (
          <LinkCard
            href="/import"
            title={`Import review: ${openItems} to check`}
            description="Match imported spreadsheet rows to catalog albums."
          />
        )}
      </CardGrid>
    </>
  );
}
