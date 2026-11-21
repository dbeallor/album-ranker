import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { loadArtistList } from "@/lib/artists";
import { getDb } from "@/lib/db/server";

const DECADES = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020];

type SearchParams = Promise<{ decade?: string | string[] }>;

export default async function ArtistsPage({ searchParams }: { searchParams: SearchParams }) {
  await connection(); // ratings are replayed per request, not at build time
  const { decade: decadeParam } = await searchParams;

  let decade: number | undefined;
  if (decadeParam !== undefined) {
    decade = typeof decadeParam === "string" && /^\d{4}$/.test(decadeParam) ? Number(decadeParam) : NaN;
    if (!DECADES.includes(decade)) notFound();
  }

  const rows = loadArtistList(getDb(), decade);
  const choices = [
    { label: "Overall", decade: undefined, href: "/artists" },
    ...DECADES.map((d) => ({ label: `${d}s`, decade: d, href: `/artists?decade=${d}` })),
  ];

  return (
    <main>
      <h1>Artists</h1>
      <nav aria-label="Decade">
        <ul style={{ listStyle: "none", padding: 0, display: "flex", gap: 12, flexWrap: "wrap" }}>
          {choices.map((choice) => (
            <li key={choice.label}>
              {choice.decade === decade ? (
                <span aria-current="page">{choice.label}</span>
              ) : (
                <Link href={choice.href}>{choice.label}</Link>
              )}
            </li>
          ))}
        </ul>
      </nav>

      {rows.length === 0 ? (
        <p>{decade === undefined ? "No rated albums yet." : `No rated albums in the ${decade}s yet.`}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Artist</th>
              <th>Score</th>
              <th>Rated albums</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.artistId}>
                <td>{row.rank}</td>
                <td>
                  <Link href={`/artists/${row.artistId}`}>{row.artistName}</Link>
                </td>
                <td>{Math.round(row.score)}</td>
                <td>{row.ratedAlbumCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
