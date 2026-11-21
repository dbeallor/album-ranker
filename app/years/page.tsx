import Link from "next/link";
import { connection } from "next/server";
import { getDb } from "@/lib/db/server";
import { listYears } from "@/lib/year-service";
import { goToYear } from "./actions";

export default async function YearsPage() {
  await connection(); // read the database per request, not at build time
  const years = listYears(getDb());

  return (
    <main>
      <h1>Years</h1>
      <form action={goToYear}>
        <label>
          Go to year <input type="number" name="year" min={1900} max={2100} step={1} required />
        </label>{" "}
        <button type="submit">Go</button>
      </form>

      {years.length === 0 ? (
        <p>No years yet. Go to a year to start ranking.</p>
      ) : (
        <ul>
          {years.map((summary) => (
            <li key={summary.year}>
              <Link href={`/years/${summary.year}`}>{summary.year}</Link>: {summary.ranked} ranked,{" "}
              {summary.honorableMentions} honorable mentions, {summary.listed} listed
            </li>
          ))}
        </ul>
      )}
      <p>
        <Link href="/">Back to home</Link>
      </p>
    </main>
  );
}
