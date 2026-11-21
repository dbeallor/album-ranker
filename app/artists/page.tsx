import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Stack } from "@/components/ui/stack";
import { Table } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
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
  ].map((choice) => ({ href: choice.href, label: choice.label, current: choice.decade === decade }));

  return (
    <>
      <PageHeader title="Artists" />
      <Stack gap={5}>
        <Tabs aria-label="Decade" items={choices} />

        {rows.length === 0 ? (
          <EmptyState>{decade === undefined ? "No rated albums yet." : `No rated albums in the ${decade}s yet.`}</EmptyState>
        ) : (
          <Table label="Artist ranking">
            <thead>
              <tr>
                <th data-numeric>Rank</th>
                <th>Artist</th>
                <th data-numeric>Score</th>
                <th data-numeric>Rated albums</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.artistId}>
                  <td data-numeric>{row.rank}</td>
                  <td>
                    <Link href={`/artists/${row.artistId}`}>{row.artistName}</Link>
                  </td>
                  <td data-numeric>{Math.round(row.score)}</td>
                  <td data-numeric>{row.ratedAlbumCount}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Stack>
    </>
  );
}
