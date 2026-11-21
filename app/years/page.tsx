import { connection } from "next/server";
import { Button } from "@/components/ui/button";
import { CardGrid } from "@/components/ui/card-grid";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineForm } from "@/components/ui/inline-form";
import { LinkCard } from "@/components/ui/link-card";
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
          <CardGrid>
            {years.map((summary) => (
              <LinkCard
                key={summary.year}
                href={`/years/${summary.year}`}
                title={summary.year}
                description={`${summary.ranked} ranked, ${summary.honorableMentions} honorable mentions, ${summary.listed} listed`}
              />
            ))}
          </CardGrid>
        )}
      </Stack>
    </>
  );
}
