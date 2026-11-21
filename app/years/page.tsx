import Link from "next/link";
import { connection } from "next/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineForm } from "@/components/ui/inline-form";
import { ListRow } from "@/components/ui/list-row";
import { PageHeader } from "@/components/ui/page-header";
import { Stack } from "@/components/ui/stack";
import { TextField } from "@/components/ui/text-field";
import { getDb } from "@/lib/db/server";
import { listYears } from "@/lib/year-service";
import { goToYear } from "./actions";

export default async function YearsPage() {
  await connection(); // read the database per request, not at build time
  const years = listYears(getDb());

  return (
    <>
      <PageHeader title="Years" />
      <Stack gap={5}>
        <InlineForm action={goToYear}>
          <TextField label="Go to year" type="number" name="year" min={1900} max={2100} step={1} required />
          <Button type="submit" variant="primary">
            Go
          </Button>
        </InlineForm>

        {years.length === 0 ? (
          <EmptyState>No years yet. Go to a year to start ranking.</EmptyState>
        ) : (
          <Stack as="ul" gap={3}>
            {years.map((summary) => (
              <Card as="li" key={summary.year}>
                <ListRow
                  title={<Link href={`/years/${summary.year}`}>{summary.year}</Link>}
                  meta={`${summary.ranked} ranked, ${summary.honorableMentions} honorable mentions, ${summary.listed} listed`}
                />
              </Card>
            ))}
          </Stack>
        )}
      </Stack>
    </>
  );
}
