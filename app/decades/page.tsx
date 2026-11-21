import { connection } from "next/server";
import { CardGrid } from "@/components/ui/card-grid";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkCard } from "@/components/ui/link-card";
import { PageHeader } from "@/components/ui/page-header";
import { getDb } from "@/lib/db/server";
import { loadDecadePicker } from "@/lib/decade-service";
import { MAX_LIST } from "@/lib/decades";

export default async function DecadesPage() {
  await connection(); // read the database per request, not at build time
  const rows = loadDecadePicker(getDb());

  return (
    <>
      <PageHeader title="Decade lists" />
      {rows.length === 0 ? (
        <EmptyState>No albums are placed in a year yet.</EmptyState>
      ) : (
        <CardGrid>
          {rows.map((row) => (
            <LinkCard
              key={row.decade}
              href={`/decades/${row.decade}`}
              title={`${row.decade}s`}
              description={`${row.listCount === 0 ? "no list yet" : `${row.listCount} of ${MAX_LIST} on the list`}, ${row.eligibleCount} eligible`}
            />
          ))}
        </CardGrid>
      )}
    </>
  );
}
