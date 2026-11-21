import { notFound } from "next/navigation";
import { connection } from "next/server";
import { YearScreen } from "@/components/year-screen";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { getDb } from "@/lib/db/server";
import { isValidYear, loadYearView } from "@/lib/year-service";
import { addFromCatalog, addManualAlbum, saveYear, searchCatalog } from "../actions";

type Params = Promise<{ year: string }>;

export default async function YearPage({ params }: { params: Params }) {
  const { year: raw } = await params;
  const year = /^\d{1,4}$/.test(raw) ? Number(raw) : NaN;
  if (!isValidYear(year)) notFound();

  await connection(); // read the database per request, not at build time
  const view = loadYearView(getDb(), year);

  return (
    <>
      <PageHeader
        title={year}
        actions={
          <>
            {isValidYear(year - 1) && <ButtonLink href={`/years/${year - 1}`}>← {year - 1}</ButtonLink>}
            <ButtonLink href="/years">All years</ButtonLink>
            {isValidYear(year + 1) && <ButtonLink href={`/years/${year + 1}`}>{year + 1} →</ButtonLink>}
          </>
        }
      />
      <YearScreen
        key={year}
        initial={view}
        saveAction={saveYear}
        searchAction={searchCatalog}
        addCatalogAction={addFromCatalog}
        addManualAction={addManualAlbum}
      />
    </>
  );
}
