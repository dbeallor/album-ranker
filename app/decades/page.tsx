import Link from "next/link";
import { connection } from "next/server";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ListRow } from "@/components/ui/list-row";
import { PageHeader } from "@/components/ui/page-header";
import { Stack } from "@/components/ui/stack";
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
        <Stack as="ul" gap={3}>
          {rows.map((row) => (
            <Card as="li" key={row.decade}>
              <ListRow
                title={<Link href={`/decades/${row.decade}`}>{row.decade}s</Link>}
                meta={`${row.listCount === 0 ? "no list yet" : `${row.listCount} of ${MAX_LIST} on the list`}, ${row.eligibleCount} eligible`}
              />
            </Card>
          ))}
        </Stack>
      )}
    </>
  );
}
