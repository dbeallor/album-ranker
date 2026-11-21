import Link from "next/link";
import { connection } from "next/server";
import { getDb } from "@/lib/db/server";
import { listImportReviewItems } from "@/lib/db/import-review";

export default async function Home() {
  // The count comes from the database, so this page is rendered per request, not at build time.
  await connection();
  const openItems = listImportReviewItems(getDb(), "open").length;

  return (
    <main>
      <h1>Album ranker</h1>
      <p>
        <Link href="/search">Search albums</Link>
      </p>
      {openItems > 0 && (
        <p>
          <Link href="/import">Import review: {openItems} to check</Link>
        </p>
      )}
    </main>
  );
}
