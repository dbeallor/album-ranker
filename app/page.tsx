import { connection } from "next/server";
import { CardGrid } from "@/components/ui/card-grid";
import { LinkCard } from "@/components/ui/link-card";
import { PageHeader } from "@/components/ui/page-header";
import { getDb } from "@/lib/db/server";
import { listImportReviewItems } from "@/lib/db/import-review";

export default async function Home() {
  // The count comes from the database, so this page is rendered per request, not at build time.
  await connection();
  const openItems = listImportReviewItems(getDb(), "open").length;

  return (
    <>
      <PageHeader title="Album ranker" description="Rank the albums you love, one matchup at a time." />
      <CardGrid>
        <LinkCard href="/search" title="Search albums" description="Look up an album or artist in the catalog." />
        <LinkCard href="/library" title="Library" description="Browse and sort every album you have listened to." />
        <LinkCard href="/matchups" title="Matchups" description="Pick the better of two albums to refine your ratings." />
        <LinkCard href="/analytics" title="Analytics" description="See album and artist rankings by year, decade, era and lifetime." />
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
