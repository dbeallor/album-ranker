import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { DecadeList } from "@/components/decade-list";
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

  return (
    <main>
      <p>
        <Link href="/decades">All decades</Link>
      </p>
      <h1>The {decade}s</h1>
      <nav aria-label="Decades" style={{ display: "flex", gap: 16 }}>
        {decade > FIRST ? <Link href={`/decades/${decade - 10}`}>Previous: {decade - 10}s</Link> : null}
        {decade < LAST ? <Link href={`/decades/${decade + 10}`}>Next: {decade + 10}s</Link> : null}
      </nav>
      <DecadeList initial={view} saveAction={saveList} acceptAction={accept} />
    </main>
  );
}
