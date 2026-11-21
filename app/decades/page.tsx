import Link from "next/link";
import { connection } from "next/server";
import { getDb } from "@/lib/db/server";
import { loadDecadePicker } from "@/lib/decade-service";
import { MAX_LIST } from "@/lib/decades";

export default async function DecadesPage() {
  await connection(); // read the database per request, not at build time
  const rows = loadDecadePicker(getDb());

  return (
    <main>
      <h1>Decade lists</h1>
      {rows.length === 0 ? (
        <p>No albums are placed in a year yet.</p>
      ) : (
        <ul>
          {rows.map((row) => (
            <li key={row.decade}>
              <Link href={`/decades/${row.decade}`}>{row.decade}s</Link>:{" "}
              {row.listCount === 0 ? "no list yet" : `${row.listCount} of ${MAX_LIST} on the list`}, {row.eligibleCount}{" "}
              eligible
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
