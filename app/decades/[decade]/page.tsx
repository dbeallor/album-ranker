import { notFound } from "next/navigation";
import { connection } from "next/server";
import { DecadeList } from "@/components/decade-list";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Stack } from "@/components/ui/stack";
import { Tabs } from "@/components/ui/tabs";
import { getDb } from "@/lib/db/server";
import { loadDecadeView } from "@/lib/decade-service";
import { accept, saveList } from "../actions";

const FIRST = 1900;
const LAST = 2100;

export default async function DecadePage({ params }: { params: Promise<{ decade: string }> }) {
  await connection(); // read the database per request, not at build time
  const { decade: param } = await params;
  const decade = /^\d{4}$/.test(param) ? Number(param) : NaN;
  if (decade % 10 !== 0 || decade < FIRST || decade > LAST) notFound();

  const view = loadDecadeView(getDb(), decade);

  const switcher = [
    ...(decade > FIRST ? [{ href: `/decades/${decade - 10}`, label: `Previous: ${decade - 10}s` }] : []),
    ...(decade < LAST ? [{ href: `/decades/${decade + 10}`, label: `Next: ${decade + 10}s` }] : []),
  ];

  return (
    <>
      <PageHeader title={`The ${decade}s`} actions={<ButtonLink href="/decades">All decades</ButtonLink>} />
      <Stack gap={5}>
        <Tabs aria-label="Decades" items={switcher} />
        <DecadeList initial={view} saveAction={saveList} acceptAction={accept} />
      </Stack>
    </>
  );
}
